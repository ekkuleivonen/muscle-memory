public static class Solution {
    public static int[][] Transpose(int[][] matrix) {
        return Enumerable.Range(0, matrix[0].Length)
            .Select(c => matrix.Select(row => row[c]).ToArray())
            .ToArray();
    }
}
