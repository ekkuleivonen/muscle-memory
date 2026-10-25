import com.acme.composer.WordCount;

/** [text] → its word count. */
final class Adapter {
    static Object call(Json args) {
        return WordCount.count(args.at(0).asString());
    }
}
