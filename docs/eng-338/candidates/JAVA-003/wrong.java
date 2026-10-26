// TODO: implement the task.
public class Solution {
    public static int lowerBound(int[] values, int target) {
        int left = 0, right = values.length;
        while (left < right) {
            int middle = left + (right - left) / 2;
            if (values[middle] <= target) left = middle + 1;
            else right = middle;
        }
        return left;
    }
}
