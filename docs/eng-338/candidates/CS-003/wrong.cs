// TODO: implement the task.
public static class Solution {
    public static int Longest(int[] values) {
        if (values.Length == 0) return 0;
        int best = 1, current = 1;
        for (int i = 1; i < values.Length; i++) {
            current = values[i] >= values[i - 1] ? current + 1 : 1;
            if (current > best) best = current;
        }
        return best;
    }
}
