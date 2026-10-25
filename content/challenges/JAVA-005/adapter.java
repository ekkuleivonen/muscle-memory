final class Adapter {
    static Object call(Json args) {
        return Solution.shift(args.at(0).asString(), args.at(1).asInt());
    }
}
