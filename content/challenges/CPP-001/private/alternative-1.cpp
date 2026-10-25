#include <string>
#include <vector>

// One cache operation: {"put", key, value} or {"get", key}.
struct Op {
    std::string name;
    int key;
    int value;
};

// Runs the operations against an LRU cache of the given capacity and returns
// the result of each get, -1 for a miss. A get counts as a use.
std::vector<int> simulate(int capacity, const std::vector<Op>& ops) {
    // Each entry remembers when it was last used; eviction scans for the oldest.
    struct Entry {
        int key;
        int value;
        long used;
    };
    std::vector<Entry> entries;
    std::vector<int> results;
    long clock = 0;
    for (const Op& op : ops) {
        clock++;
        Entry* found = nullptr;
        for (Entry& e : entries)
            if (e.key == op.key) found = &e;
        if (op.name == "get") {
            if (!found) {
                results.push_back(-1);
                continue;
            }
            found->used = clock;
            results.push_back(found->value);
        } else if (op.name == "put") {
            if (found) {
                found->value = op.value;
                found->used = clock;
                continue;
            }
            if ((int)entries.size() >= capacity) {
                size_t oldest = 0;
                for (size_t i = 1; i < entries.size(); i++)
                    if (entries[i].used < entries[oldest].used) oldest = i;
                entries.erase(entries.begin() + oldest);
            }
            entries.push_back({op.key, op.value, clock});
        }
    }
    return results;
}
