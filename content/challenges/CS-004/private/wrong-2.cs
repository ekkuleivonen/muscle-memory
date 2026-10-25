// Mistake: reverses row order
public static class Solution {
    public static int[][] Transpose(int[][] matrix) {
        return Enumerable.Range(0, matrix[0].Length)
            .Select(c => matrix.Reverse().Select(row => row[c]).ToArray())
            .ToArray();
    }
}
