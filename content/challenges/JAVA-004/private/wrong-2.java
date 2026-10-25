// Mistake: only main diagonal
public class Solution {
    public static int diagonalSum(int[][] matrix) {
        int s = 0;
        for (int i = 0; i < matrix.length; i++)
            s += matrix[i][i];
        return s;
    }
}
