final class Adapter {
    static Object call(Json args) {
        return Solution.lowerBound(args.at(0).asIntArray(), args.at(1).asInt());
    }
}
