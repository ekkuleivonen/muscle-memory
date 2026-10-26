// TODO: implement the task.
public static class Solution {
    public static int[][] Transpose(int[][] matrix) {
        int rows = matrix.Length, columns = matrix[0].Length;
        int[][] result = new int[columns][];
        for (int c = 0; c < columns; c++) {
            result[c] = new int[rows];
            for (int r = 0; r < rows; r++) result[c][r] = matrix[rows - 1 - r][c];
        }
        return result;
    }
}
