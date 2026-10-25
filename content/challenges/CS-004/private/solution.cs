public static class Solution {
    public static int[][] Transpose(int[][] matrix) {
        int[][] o = new int[matrix[0].Length][];
        for (int c = 0; c < o.Length; c++) {
            o[c] = new int[matrix.Length];
            for (int r = 0; r < matrix.Length; r++)
                o[c][r] = matrix[r][c];
        }
        return o;
    }
}
