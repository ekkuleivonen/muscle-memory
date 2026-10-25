public class Solution {
    public static int diagonalSum(int[][] matrix) {
        int s = 0, n = matrix.length;
        for (int r = 0; r < n; r++)
            for (int c = 0; c < n; c++)
                if (r == c || r + c == n - 1)
                    s += matrix[r][c];
        return s;
    }
}
