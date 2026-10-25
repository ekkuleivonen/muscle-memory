#include <algorithm>
#include <vector>
std::vector<int> rotate_right(const std::vector<int> &v, int k) {
    auto o = v;
    if (!o.empty())
        std::rotate(o.begin(), o.end() - k % o.size(), o.end());
    return o;
}
