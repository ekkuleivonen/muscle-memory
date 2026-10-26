#include <vector>
#include <algorithm>
std::vector<std::vector<int>> merge_intervals(const std::vector<std::vector<int>> &intervals) {
    auto sorted = intervals;
    std::sort(sorted.begin(), sorted.end());
    std::vector<std::vector<int>> merged;
    for (const auto& interval : sorted) {
        if (merged.empty() || interval[0] > merged.back()[1])
            merged.push_back(interval);
        else
            merged.back()[1] = std::max(merged.back()[1], interval[1]);
    }
    return merged;
}
