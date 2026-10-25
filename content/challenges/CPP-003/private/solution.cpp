#include <string>
#include <vector>
bool balanced(const std::string &text) {
    std::vector<char> s;
    for (char c : text) {
        if (c == '(' || c == '[' || c == '{')
            s.push_back(c);
        else if (c == ')' || c == ']' || c == '}') {
            if (s.empty())
                return false;
            char o = s.back();
            s.pop_back();
            if ((c == ')' && o != '(') || (c == ']' && o != '[') || (c == '}' && o != '{'))
                return false;
        }
    }
    return s.empty();
}
