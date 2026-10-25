// Purged slots are skipped but never reused, so the table fills up with them and puts are refused while slots are free.
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
        Slot *free = nullptr;
        std::size_t i = home(key);
        for (std::size_t probes = 0; probes < slots_.size(); probes++) {
            Slot &slot = slots_[i];
            if (slot.state == State::Empty) {
                if (!free) free = &slot;
                break;
            }
            if (slot.state == State::Purged) {
                // Skip it: the key may be further along the chain.
            } else if (slot.key == key) {
                slot.value = value;
                return true;
            }
            i = next(i);
        }
        if (!free) return false;
        *free = Slot{State::Full, key, value};
        return true;
    }

    // The value stored under key, or -1 on a miss.
    int get(int key) const {
        const Slot *slot = find(key);
        return slot ? slot->value : -1;
    }

    // Purges key, if it is there. The slot stays marked rather than empty, so keys that
    // probed past it are still found.
    void erase(int key) {
        Slot *slot = const_cast<Slot *>(find(key));
        if (slot) slot->state = State::Purged;
    }

  private:
    enum class State : unsigned char { Empty, Full, Purged };
    struct Slot {
        State state = State::Empty;
        int key = 0;
        int value = 0;
    };

    // Keys are already hashes of the request (method, host, path, Vary headers).
    std::size_t home(int key) const { return static_cast<unsigned>(key) % slots_.size(); }
    std::size_t next(std::size_t i) const { return (i + 1) % slots_.size(); }

    const Slot *find(int key) const {
        if (slots_.empty()) return nullptr;
        std::size_t i = home(key);
        for (std::size_t probes = 0; probes < slots_.size(); probes++) {
            const Slot &slot = slots_[i];
            if (slot.state == State::Empty) return nullptr;
            if (slot.state == State::Full && slot.key == key) return &slot;
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
