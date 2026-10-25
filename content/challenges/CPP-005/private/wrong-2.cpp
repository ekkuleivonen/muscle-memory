/* Mistake: combines disjoint intervals too. */
#include <algorithm>
#include <vector>
std::vector<std::vector<int>> merge_intervals(const std::vector<std::vector<int>> &v) {
    if (v.empty())
        return {};
    int a = v[0][0], b = v[0][1];
    for (auto p : v) {
        a = std::min(a, p[0]);
        b = std::max(b, p[1]);
    }
    return {{a, b}};
}
