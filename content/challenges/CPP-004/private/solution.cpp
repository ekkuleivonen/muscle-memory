#include <vector>
std::vector<int> rotate_right(const std::vector<int> &v, int k) {
    if (v.empty())
        return {};
    std::vector<int> o(v.size());
    for (size_t i = 0; i < v.size(); i++)
        o[(i + k) % v.size()] = v[i];
    return o;
}
