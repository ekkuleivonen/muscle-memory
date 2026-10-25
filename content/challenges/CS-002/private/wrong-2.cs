// Reads "away from zero" as always rounding up, so 0.0505 becomes 0.06 instead of 0.05.
namespace Billing;

public static class LateFees
{
    /// <summary>
    /// The late fee on an overdue invoice: 0.5% of the balance per day late, at most 10% of
    /// the balance, in cents. Finance rounds halves away from zero.
    /// </summary>
    public static decimal LateFee(decimal balance, int daysLate)
    {
        if (daysLate <= 0) return 0;
        var fee = Math.Min(balance * 0.005m * daysLate, balance * 0.10m);
        return Math.Ceiling(fee * 100) / 100;
    }
}
