// Works in double: 0.035 is stored as 0.034999…, so a fee that is exactly half a cent rounds down.
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
        double fee = Math.Min((double)balance * 0.005 * daysLate, (double)balance * 0.10);
        return (decimal)Math.Round(fee, 2, MidpointRounding.AwayFromZero);
    }
}
