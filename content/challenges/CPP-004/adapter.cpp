#include "mm_json.h"
#include <string>
#include <vector>
std::vector<int> rotate_right(const std::vector<int> &, int);
mm_value *mm_call(const mm_value *args) {
    std::vector<int> a;
    const mm_value *l = mm_at(args, 0);
    for (size_t i = 0; i < mm_length(l); i++)
        a.push_back((int)mm_integer(mm_at(l, i)));
    mm_value *r = mm_new_array();
    for (int x : rotate_right(a, (int)mm_integer(mm_at(args, 1))))
        mm_push(r, mm_new_integer(x));
    return r;
}
