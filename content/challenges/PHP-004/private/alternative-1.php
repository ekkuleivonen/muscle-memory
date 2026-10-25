<?php
declare(strict_types=1);
function evensFirst(array $values): array
{
    return array_merge(
        array_values(array_filter($values, fn($x) => $x % 2 === 0)),
        array_values(array_filter($values, fn($x) => $x % 2 !== 0)),
    );
}
