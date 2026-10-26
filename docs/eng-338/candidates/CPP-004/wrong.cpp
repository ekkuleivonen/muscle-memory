#include <vector>
std::vector<int> rotate_right(const std::vector<int> &values, int k)
{
    if (values.empty()) return {};
    if (static_cast<std::size_t>(k) >= values.size()) return values;
    std::vector<int> result(values.size());
    const std::size_t shift = static_cast<std::size_t>(k);
    for (std::size_t i = 0; i < values.size(); ++i)
        result[(i + shift) % values.size()] = values[i];
    return result;
}
