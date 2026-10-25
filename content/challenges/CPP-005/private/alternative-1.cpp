#include <algorithm>
#include <vector>
std::vector<std::vector<int>> merge_intervals(const std::vector<std::vector<int>> &in) {
    auto a = in;
    bool change = true;
    while (change) {
        change = false;
        for (size_t i = 0; i < a.size() && !change; i++)
            for (size_t j = i + 1; j < a.size(); j++)
                if (a[i][0] <= a[j][1] && a[j][0] <= a[i][1]) {
                    a[i][0] = std::min(a[i][0], a[j][0]);
                    a[i][1] = std::max(a[i][1], a[j][1]);
                    a.erase(a.begin() + j);
                    change = true;
                    break;
                }
    }
    std::sort(a.begin(), a.end());
    return a;
}
