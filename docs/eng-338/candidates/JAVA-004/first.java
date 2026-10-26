// TODO: implement the task.
public class Solution {
    public static int diagonalSum(int[][] matrix) {
        int sum = 0;
        for (int r = 0; r < matrix.length; r++) {
            int other = matrix.length - 1 - r;
            sum += matrix[r][r];
            if (other != r) sum += matrix[r][other];
        }
        return sum;
    }
}
