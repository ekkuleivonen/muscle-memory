/* Mistake: discards repeated values. */
#include <set>
#include <vector>
std::vector<int> rotate_right(const std::vector<int> &v, int k) {
    std::set<int> s(v.begin(), v.end());
    return {s.begin(), s.end()};
}
