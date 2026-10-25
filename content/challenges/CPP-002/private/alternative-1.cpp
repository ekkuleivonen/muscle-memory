// cache_index.cpp: the response cache's index, from a request's key to the slot that holds
// its response in the arena.
//
// Open addressing with linear probing over a fixed array of slots, sized once at startup from
// cache.index_slots. It replaced a std::unordered_map index, which allocated a node on every
// insert.
#include <cstddef>
#include <string>
#include <vector>

namespace {

class CacheIndex {
  public:
    explicit CacheIndex(std::size_t slots) : slots_(slots) {}

    // Stores value under key. False when every slot is taken: the response is then served
    // without being cached.
    bool put(int key, int value) {
        if (slots_.empty()) return false;
        std::size_t i = home(key);
        for (std::size_t probes = 0; probes < slots_.size(); probes++) {
            Slot &slot = slots_[i];
            if (slot.state == State::Empty) {
                slot = Slot{State::Full, key, value};
                return true;
            }
            if (slot.key == key) {
                slot.value = value;
                return true;
            }
            i = next(i);
        }
        return false;
    }

    // The value stored under key, or -1 on a miss.
    int get(int key) const {
        const Slot *slot = find(key);
        return slot ? slot->value : -1;
    }

    // Purges key, if it is there. Rather than leave a hole that would cut later keys off from
    // their home slot, it shifts the rest of the chain back over it (backward-shift deletion),
    // so the table never holds a purged slot.
    void erase(int key) {
        const Slot *found = find(key);
        if (!found) return;
        std::size_t hole = static_cast<std::size_t>(found - slots_.data());
        std::size_t i = hole;
        for (std::size_t probes = 1; probes < slots_.size(); probes++) {
            i = next(i);
            if (slots_[i].state == State::Empty) break;
            // An entry may fill the hole only if the hole lies on its path from home to i.
            if (distance(home(slots_[i].key), hole) < distance(home(slots_[i].key), i)) {
                slots_[hole] = slots_[i];
                hole = i;
            }
        }
        slots_[hole] = Slot{};
    }

  private:
    enum class State : unsigned char { Empty, Full };
    struct Slot {
        State state = State::Empty;
        int key = 0;
        int value = 0;
    };

    // Keys are already hashes of the request (method, host, path, Vary headers).
    std::size_t home(int key) const { return static_cast<unsigned>(key) % slots_.size(); }
    std::size_t next(std::size_t i) const { return (i + 1) % slots_.size(); }
    // How many steps forward from slot `from` to slot `to`, wrapping around.
    std::size_t distance(std::size_t from, std::size_t to) const {
        return (to + slots_.size() - from) % slots_.size();
    }

    const Slot *find(int key) const {
        if (slots_.empty()) return nullptr;
        std::size_t i = home(key);
        for (std::size_t probes = 0; probes < slots_.size(); probes++) {
            const Slot &slot = slots_[i];
            if (slot.state == State::Empty) return nullptr;
            if (slot.key == key) return &slot;
            i = next(i);
        }
        return nullptr;
    }

    std::vector<Slot> slots_;
};

}  // namespace

// One line of a cache log: {"put", key, value}, {"get", key} or {"erase", key}.
struct Op {
    std::string name;
    int key;
    int value;
};

// Replays a cache log against an index with the given number of slots and returns what each
// get found, -1 for a miss. edgectl cache replay and the tests use it.
std::vector<int> cache_index(int slots, const std::vector<Op>& ops) {
    CacheIndex index(static_cast<std::size_t>(slots));
    std::vector<int> found;
    for (const Op &op : ops) {
        if (op.name == "put")
            index.put(op.key, op.value);
        else if (op.name == "erase")
            index.erase(op.key);
        else if (op.name == "get")
            found.push_back(index.get(op.key));
    }
    return found;
}
