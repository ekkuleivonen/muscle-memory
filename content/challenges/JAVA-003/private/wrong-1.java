// Mistake: uses upper bound
public class Solution {
    public static int lowerBound(int[] values, int target) {
        int i = 0;
        while (i < values.length && values[i] <= target)
            i++;
        return i;
    }
}
