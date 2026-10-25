/* Mistake: sorts without merging. */
#include <algorithm>
#include <vector>
std::vector<std::vector<int>> merge_intervals(const std::vector<std::vector<int>> &v) {
    auto o = v;
    std::sort(o.begin(), o.end());
    return o;
}
