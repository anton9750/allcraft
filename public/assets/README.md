# Audio assets

- `music/song-01.mp3`, `music/song-02.mp3` - background playlist. Plays on the first click, auto-advances when a song ends, cycles forever. The skip button in the header jumps to the next song.
- `sounds/drag-01.mp3` ... `sounds/drag-10.mp3` - drag sounds, random order (bell button turns them off)

To add more songs, drop them in `music/` and list them in `src/config/audio.ts` (`MUSIC_TRACKS`).
Missing files are skipped; if no song loads, a built-in ambient loop plays.
