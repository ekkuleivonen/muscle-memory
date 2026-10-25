final class Adapter {
    static int[][] read(Json a) {
        int[][] m = new int[a.size()][];
        for (int i = 0; i < m.length; i++)
            m[i] = a.at(i).asIntArray();
        return m;
    }
    static Object call(Json args) { return Solution.diagonalSum(read(args.at(0))); }
}
