/* Mistake: rotates left. */
#include <vector>
std::vector<int> rotate_right(const std::vector<int> &v, int k) {
    auto o = v;
    for (size_t i = 0; i < v.size(); i++)
        o[i] = v[(i + k) % v.size()];
    return o;
}
