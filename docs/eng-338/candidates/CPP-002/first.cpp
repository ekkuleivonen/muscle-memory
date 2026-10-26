#include <cstddef>
#include <string>
#include <vector>

namespace {
class CacheIndex {
  public:
    explicit CacheIndex(std::size_t slots) : slots_(slots) {}

    bool put(int key, int value) {
        if (slots_.empty()) return false;
        const std::size_t none = slots_.size();
        std::size_t available = none;
        std::size_t i = home(key);
        for (std::size_t probes = 0; probes < slots_.size(); ++probes) {
            Slot &slot = slots_[i];
            if (slot.state == State::Full && slot.key == key) {
                slot.value = value;
                return true;
            }
            if (slot.state == State::Deleted && available == none)
                available = i;
            if (slot.state == State::Empty) {
                if (available == none) available = i;
                break;
            }
            i = next(i);
        }
        if (available == none) return false;
        slots_[available] = Slot{State::Full, key, value};
        return true;
    }

    int get(int key) const {
        const Slot *slot = find(key);
        return slot ? slot->value : -1;
    }

    void erase(int key) {
        Slot *slot = const_cast<Slot *>(find(key));
        if (slot) slot->state = State::Deleted;
    }

  private:
    enum class State : unsigned char { Empty, Full, Deleted };
    struct Slot {
        State state = State::Empty;
        int key = 0;
        int value = 0;
    };

    std::size_t home(int key) const { return static_cast<unsigned>(key) % slots_.size(); }
    std::size_t next(std::size_t i) const { return (i + 1) % slots_.size(); }

    const Slot *find(int key) const {
        if (slots_.empty()) return nullptr;
        std::size_t i = home(key);
        for (std::size_t probes = 0; probes < slots_.size(); ++probes) {
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

struct Op {
    std::string name;
    int key;
    int value;
};

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
