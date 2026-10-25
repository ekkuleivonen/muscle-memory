#include "mm_json.h"
#include <string>
#include <vector>
bool balanced(const std::string &);
mm_value *mm_call(const mm_value *args) { return mm_new_bool(balanced(mm_string(mm_at(args, 0)))); }
