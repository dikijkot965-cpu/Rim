# Stage C — script tag removal order (from index.html)

Do **one group at a time** + smoke after each.

1. **Safe first (nav/cleanup only):** 07, 10
2. **Feature patches with modular owners:** 08, 11, 16, 21
3. **Mid surface:** 05, 09, 13, 19, 20, 22, 23
4. **Heavy open/timeline:** 14, 15, 17, 18, 24, 25
5. **Core last:** 12, 06, 04, 03, 02

Never remove 02 before modular owns auth bootstrap + all globals the shell expects.
