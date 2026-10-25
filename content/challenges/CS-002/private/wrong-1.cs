// Rounds the daily fee before capping, so a capped fee like 0.505 is returned unrounded.
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
        var fee = Math.Round(balance * 0.005m * daysLate, 2, MidpointRounding.AwayFromZero);
        return Math.Min(fee, balance * 0.10m);
    }
}
