import com.acme.accounts.PasswordPolicy;

/** [password] → the rules it breaks. */
final class Adapter {
    static Object call(Json args) {
        return PasswordPolicy.violations(args.at(0).asString());
    }
}
