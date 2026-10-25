#include <algorithm>
#include <vector>
std::vector<std::vector<int>> merge_intervals(const std::vector<std::vector<int>> &in) {
    auto a = in;
    std::sort(a.begin(), a.end());
    std::vector<std::vector<int>> o;
    for (auto p : a) {
        if (o.empty() || p[0] > o.back()[1])
            o.push_back(p);
        else
            o.back()[1] = std::max(o.back()[1], p[1]);
    }
    return o;
}
