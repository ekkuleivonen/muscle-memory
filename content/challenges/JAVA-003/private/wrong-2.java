// Mistake: reports missing values as -1
public class Solution {
    public static int lowerBound(int[] values, int target) {
        for (int i = 0; i < values.length; i++)
            if (values[i] == target)
                return i;
        return -1;
    }
}
