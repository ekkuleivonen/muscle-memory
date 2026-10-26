#include <string>
#include <vector>
#include <list>
#include <utility>

// One cache operation: {"put", key, value} or {"get", key}.
struct Op {
    std::string name;
    int key;
    int value;
};

// Runs an LRU cache; front is the most recently used entry.
std::vector<int> simulate(int capacity, const std::vector<Op>& ops) {
    std::vector<int> results;
    std::list<std::pair<int, int>> entries;
    for (const Op& op : ops) {
        auto found = entries.begin();
        while (found != entries.end() && found->first != op.key) ++found;
        if (op.name == "get") {
            if (found == entries.end()) results.push_back(-1);
            else {
                results.push_back(found->second);
            }
        } else if (op.name == "put") {
            if (found != entries.end()) {
                found->second = op.value;
                entries.splice(entries.begin(), entries, found);
            } else if (capacity > 0) {
                if (entries.size() >= static_cast<std::size_t>(capacity))
                    entries.pop_back();
                entries.emplace_front(op.key, op.value);
            }
        }
    }
    return results;
}
