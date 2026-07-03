use rusqlite::Connection;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

// 66 books of the Bible (KJV ordering)
const BOOK_NAMES: [&str; 66] = [
    "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
    "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
    "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra",
    "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
    "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah", "Lamentations",
    "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
    "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk",
    "Zephaniah", "Haggai", "Zechariah", "Malachi",
    "Matthew", "Mark", "Luke", "John", "Acts",
    "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians",
    "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians",
    "1 Timothy", "2 Timothy", "Titus", "Philemon",
    "Hebrews", "James", "1 Peter", "2 Peter",
    "1 John", "2 John", "3 John", "Jude", "Revelation",
];

// Dummy seed verses for development (a few well-known verses)
// Full KJV will be loaded via the generate_kjv_seed script in production
const SEED_VERSES: &[(usize, &str, &str)] = &[
    // (book_index, "chapter:verse", "text")
    (0, "1:1", "In the beginning God created the heaven and the earth."),
    (0, "1:2", "And the earth was without form, and void; and darkness was upon the face of the deep. And the Spirit of God moved upon the face of the waters."),
    (0, "1:3", "And God said, Let there be light: and there was light."),
    (0, "1:4", "And God saw the light, that it was good: and God divided the light from the darkness."),
    (0, "1:5", "And God called the light Day, and the darkness he called Night. And the evening and the morning were the first day."),

    (42, "3:16", "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life."),
    (42, "3:17", "For God sent not his Son into the world to condemn the world; but that the world through him might be saved."),
    (42, "3:18", "He that believeth on him is not condemned: but he that believeth not is condemned already, because he hath not believed in the name of the only begotten Son of God."),

    (43, "16:31", "And they said, Believe on the Lord Jesus Christ, and thou shalt be saved, and thy house."),

    (44, "8:28", "And we know that all things work together for good to them that love God, to them who are the called according to his purpose."),
    (44, "8:29", "For whom he did foreknow, he also did predestinate to be conformed to the image of his Son, that he might be the firstborn among many brethren."),
    (44, "8:30", "Moreover whom he did predestinate, them he also called: and whom he called, them he also justified: and whom he justified, them he also glorified."),

    (45, "13:4", "Charity suffereth long, and is kind; charity envieth not; charity vaunteth not itself, is not puffed up."),
    (45, "13:5", "Doth not behave itself unseemly, seeketh not her own, is not easily provoked, thinketh no evil;"),
    (45, "13:6", "Rejoiceth not in iniquity, but rejoiceth in the truth;"),
    (45, "13:7", "Beareth all things, believeth all things, hopeth all things, endureth all things."),
    (45, "13:8", "Charity never faileth: but whether there be prophecies, they shall fail; whether there be tongues, they shall cease; whether there be knowledge, it shall vanish away."),

    (48, "2:8", "For by grace are ye saved through faith; and that not of yourselves: it is the gift of God:"),
    (48, "2:9", "Not of works, lest any man should boast."),

    (49, "4:13", "I can do all things through Christ which strengtheneth me."),

    (57, "11:1", "Now faith is the substance of things hoped for, the evidence of things not seen."),
    (57, "11:6", "But without faith it is impossible to please him: for he that cometh to God must believe that he is, and that he is a rewarder of them that diligently seek him."),

    (58, "1:2", "My brethren, count it all joy when ye fall into divers temptations;"),
    (58, "1:3", "Knowing this, that the trying of your faith worketh patience."),
    (58, "1:4", "But let patience have her perfect work, that ye may be perfect and entire, wanting nothing."),

    (59, "5:7", "Casting all your care upon him; for he careth for you."),

    (65, "3:16", "And we have known and believed the love that God hath to us. God is love; and he that dwelleth in love dwelleth in God, and God in him."),

    (18, "23:1", "The Lord is my shepherd; I shall not want."),
    (18, "23:2", "He maketh me to lie down in green pastures: he leadeth me beside the still waters."),
    (18, "23:3", "He restoreth my soul: he leadeth me in the paths of righteousness for his name's sake."),
    (18, "23:4", "Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me."),
    (18, "23:5", "Thou preparest a table before me in the presence of mine enemies: thou anointest my head with oil; my cup runneth over."),
    (18, "23:6", "Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the Lord for ever."),

    (19, "3:5", "Trust in the Lord with all thine heart; and lean not unto thine own understanding."),
    (19, "3:6", "In all thy ways acknowledge him, and he shall direct thy paths."),

    (20, "3:1", "To every thing there is a season, and a time to every purpose under the heaven:"),
];

fn clean_text(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() || c.is_whitespace() { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn seed_dummy_data(conn: &Connection) -> Result<(), rusqlite::Error> {
    // Insert KJV translation metadata
    conn.execute(
        "INSERT OR IGNORE INTO translation_metadata (code, name, is_default, imported_at) VALUES ('KJV', 'King James Version', 1, datetime('now'))",
        [],
    )?;

    // Insert seed verses
    for (book_idx, ref_str, text) in SEED_VERSES {
        let parts: Vec<&str> = ref_str.split(':').collect();
        if parts.len() != 2 {
            continue;
        }
        let chapter: i64 = parts[0].parse().unwrap_or(0);
        let verse: i64 = parts[1].parse().unwrap_or(0);
        let book_name = BOOK_NAMES.get(*book_idx).unwrap_or(&"Unknown");
        let clean_tokens = clean_text(text);

        conn.execute(
            "INSERT INTO local_bible_repository (translation_code, book_index, book_name, chapter_number, verse_number, verse_text, clean_search_tokens)
             VALUES ('KJV', ?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                (*book_idx as i64) + 1,
                book_name,
                chapter,
                verse,
                text,
                clean_tokens,
            ],
        )?;
    }

    Ok(())
}

// Fix book_name values using book_index (the seed SQL ships 'Unknown' names).
fn fix_book_names(conn: &Connection) -> Result<(), rusqlite::Error> {
    for (idx, name) in BOOK_NAMES.iter().enumerate() {
        conn.execute(
            "UPDATE local_bible_repository SET book_name = ?1 WHERE book_index = ?2",
            rusqlite::params![name, (idx as i64) + 1],
        )?;
    }
    Ok(())
}

// Load the full KJV seed from the bundled SQL file. Returns Ok(true) if the
// file was found and executed, Ok(false) if no seed file exists.
pub fn seed_bible_from_file(
    conn: &Connection,
    app: &AppHandle,
) -> Result<bool, Box<dyn std::error::Error>> {
    let path = app
        .path()
        .resolve("seed_kjv.sql", BaseDirectory::Resource)?;

    if !path.exists() {
        eprintln!("Seed SQL file not found at: {:?}", path);
        return Ok(false);
    }

    let sql = std::fs::read_to_string(&path)?;
    eprintln!("Executing KJV seed from: {:?}", path);
    conn.execute_batch(&sql)?;
    fix_book_names(conn)?;

    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM local_bible_repository",
        [],
        |row| row.get(0),
    )?;
    eprintln!("KJV seed complete: {} verses loaded.", count);

    Ok(true)
}

pub fn seed_bible(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let conn = Connection::open(crate::db::get_db_path(app))?;
    crate::db::schema::create_tables(&conn)?;
    if !seed_bible_from_file(&conn, app)? {
        seed_dummy_data(&conn)?;
    }
    Ok(())
}
