#include "mm_json.h"
#include <string>
#include <vector>
std::vector<std::vector<int>> merge_intervals(const std::vector<std::vector<int>> &);
mm_value *mm_call(const mm_value *args) {
    std::vector<std::vector<int>> a;
    const mm_value *l = mm_at(args, 0);
    for (size_t i = 0; i < mm_length(l); i++)
        a.push_back(
            {(int)mm_integer(mm_at(mm_at(l, i), 0)), (int)mm_integer(mm_at(mm_at(l, i), 1))});
    mm_value *r = mm_new_array();
    for (auto p : merge_intervals(a)) {
        mm_value *t = mm_new_array();
        for (int x : p)
            mm_push(t, mm_new_integer(x));
        mm_push(r, t);
    }
    return r;
}
