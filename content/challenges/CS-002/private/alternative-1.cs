namespace Billing;

public static class LateFees
{
    /// <summary>
    /// The late fee on an overdue invoice: 0.5% of the balance per day late, at most 10% of
    /// the balance, in cents. Finance rounds halves away from zero.
    /// </summary>
    public static decimal LateFee(decimal balance, int daysLate)
    {
        // 0.5% a day reaches the 10% cap after 20 days.
        var days = Math.Clamp(daysLate, 0, 20);
        var cents = balance * 0.5m * days;
        return decimal.Floor(cents + 0.5m) / 100m;
    }
}
