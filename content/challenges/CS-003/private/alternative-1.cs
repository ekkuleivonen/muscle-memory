public static class Solution {
    public static int Longest(int[] values) {
        int best = 0;
        for (int i = 0; i < values.Length; i++) {
            int j = i + 1;
            while (j < values.Length && values[j] > values[j - 1])
                j++;
            best = Math.Max(best, j - i);
        }
        return best;
    }
}
