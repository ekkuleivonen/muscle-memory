public static class Solution {
    public static int Longest(int[] values) {
        int best = 0, run = 0;
        for (int i = 0; i < values.Length; i++) {
            run = i > 0 && values[i] > values[i - 1] ? run + 1 : 1;
            best = Math.Max(best, run);
        }
        return best;
    }
}
