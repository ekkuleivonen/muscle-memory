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
        var fee = balance * 0.005m * System.Math.Min(daysLate, 20);
        return System.Math.Round(fee, 2, System.MidpointRounding.AwayFromZero);
    }
}
