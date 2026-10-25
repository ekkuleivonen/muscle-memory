public class Solution {
    public static int lowerBound(int[] values, int target) {
        int l = 0, r = values.length;
        while (l < r) {
            int m = l + (r - l) / 2;
            if (values[m] < target)
                l = m + 1;
            else
                r = m;
        }
        return l;
    }
}
