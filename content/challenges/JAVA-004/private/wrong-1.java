// Mistake: counts center twice
public class Solution {
    public static int diagonalSum(int[][] matrix) {
        int s = 0, n = matrix.length;
        for (int r = 0; r < n; r++)
            s += matrix[r][r] + matrix[r][n - 1 - r];
        return s;
    }
}
