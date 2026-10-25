#include <list>
#include <string>
#include <unordered_map>
#include <utility>
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
    // Most recently used first; the map points into the list.
    std::list<std::pair<int, int>> order;
    std::unordered_map<int, std::list<std::pair<int, int>>::iterator> where;
    std::vector<int> results;
    for (const Op& op : ops) {
        auto found = where.find(op.key);
        if (op.name == "get") {
            if (found == where.end()) {
                results.push_back(-1);
                continue;
            }
            order.splice(order.begin(), order, found->second);
            results.push_back(found->second->second);
        } else if (op.name == "put") {
            if (found != where.end()) {
                found->second->second = op.value;
                order.splice(order.begin(), order, found->second);
                continue;
            }
            if (capacity <= 0) continue;
            if ((int)order.size() >= capacity) {
                where.erase(order.back().first);
                order.pop_back();
            }
            order.emplace_front(op.key, op.value);
            where[op.key] = order.begin();
        }
    }
    return results;
}
