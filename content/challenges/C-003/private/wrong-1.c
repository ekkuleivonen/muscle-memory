/* Mistake: total size ignores value changes. */
#include <stddef.h>
int longest_run(const int *v, size_t n) { return (int)n; }
