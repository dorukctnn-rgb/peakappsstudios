/* The sample export: a made-up account, sample_saver_2026, with the same files and columns as a real Reddit data request
 * (checked against an export made in June 2026). Every post, comment, message and chat in it is invented; the community
 * names are real public communities, used only so the sample looks like a real export. It has 1,240 saved posts and
 * comments, more than the 1,000 Reddit's own saved list shows. Built the same way every time (no randomness). */
import { toCsv } from './csv.js';

export const SAMPLE_NAME = 'export_sample_saver_2026_20261029.zip';
export const SAMPLE_ACCOUNT = 'sample_saver_2026';
export const SAMPLE_SAVED = 1240;

const SUBS = ['Sourdough', 'woodworking', 'CampingandHiking', 'personalfinance', 'AskHistorians', 'Python', 'houseplants', 'Breadit', 'bicycletouring', 'Cooking', 'learnprogramming', 'DIY'];
const WORDS = {
  Sourdough: ['my_starter_finally_doubled_in_six_hours', 'why_is_my_crumb_so_tight', 'cold_retard_overnight_schedule_that_works', 'rye_starter_conversion_notes', 'oven_spring_with_a_dutch_oven'],
  woodworking: ['first_dovetail_box_from_walnut_offcuts', 'how_i_flatten_a_workbench_top_by_hand', 'finish_for_a_cutting_board', 'shop_made_crosscut_sled_plans'],
  CampingandHiking: ['ultralight_tarp_pitch_in_strong_wind', 'my_three_season_gear_list_under_9_lbs', 'water_filter_comparison_after_200_miles'],
  personalfinance: ['how_we_paid_off_18k_in_two_years', 'emergency_fund_in_a_high_yield_account', 'what_to_do_with_an_old_401k'],
  AskHistorians: ['how_did_medieval_bakers_keep_yeast_alive', 'what_did_sailors_eat_on_long_voyages', 'how_were_maps_copied_before_printing'],
  Python: ['pathlib_tricks_i_wish_i_knew_sooner', 'read_a_large_csv_without_running_out_of_memory', 'dataclasses_vs_namedtuple'],
  houseplants: ['pothos_propagation_in_water_week_by_week', 'my_monstera_has_yellow_leaves_help', 'bright_indirect_light_explained'],
  Breadit: ['focaccia_with_rosemary_and_sea_salt', 'how_much_steam_for_a_crisp_crust', 'bagels_boiled_with_barley_malt'],
  bicycletouring: ['packing_list_for_two_weeks_on_the_danube', 'how_i_fixed_a_broken_spoke_on_the_road'],
  Cooking: ['the_only_tomato_sauce_recipe_you_need', 'knife_sharpening_for_beginners', 'freezer_meals_that_reheat_well'],
  learnprogramming: ['how_i_finally_understood_recursion', 'a_study_plan_that_kept_me_going'],
  DIY: ['fixing_a_running_toilet_in_ten_minutes', 'patching_drywall_so_nobody_can_tell', 'replace_a_light_switch_safely'],
};
const B36 = n => n.toString(36);
// post and comment ids count up in base 36; the spread below runs from posts of 2014 to posts of October 2026
const POST_LOW = parseInt('24znn6', 36);
const POST_HIGH = parseInt('1wz2bfj', 36);
const COMMENT_LOW = parseInt('c0abcd1', 36);
const COMMENT_HIGH = parseInt('ooq7eyp', 36);

function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const at = (y, mo, d, h = 12, mi = 0, s = 0) => `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')} ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')} UTC`;
const url = (sub, id, slug, cid = '') => `https://www.reddit.com/r/${sub}/comments/${id}/${slug}/${cid ? `${cid}/` : ''}`;

export function sampleFiles() {
  const rnd = lcg(20261029);
  const pick = a => a[Math.floor(rnd() * a.length)];
  const files = {};
  const csv = (name, header, rows) => { files[name] = toCsv(header, rows, { bom: false }).replace(/\r\n/g, '\n'); };

  // saved posts and comments: newest saves first, like the export
  const savedPosts = [];
  const savedComments = [];
  for (let k = 0; k < SAMPLE_SAVED; k++) {
    const sub = SUBS[(k * 7 + Math.floor(rnd() * 5)) % SUBS.length];
    const slug = pick(WORDS[sub]);
    const frac = 1 - k / SAMPLE_SAVED;
    const pid = B36(Math.floor(POST_LOW + (POST_HIGH - POST_LOW) * Math.pow(frac, 1.7) + rnd() * 900));
    if (k % 9 === 4) {
      const cid = B36(Math.floor(COMMENT_LOW + (COMMENT_HIGH - COMMENT_LOW) * frac + rnd() * 900));
      savedComments.push([cid, url(sub, pid, slug, cid)]);
    } else {
      savedPosts.push([pid, url(sub, pid, slug)]);
    }
  }
  csv('saved_posts.csv', ['id', 'permalink'], savedPosts);
  csv('saved_comments.csv', ['id', 'permalink'], savedComments);
  csv('hidden_posts.csv', ['id', 'permalink'], [['1o2p3q4', url('personalfinance', '1o2p3q4', 'is_this_credit_card_offer_worth_it')]]);

  // your own posts
  const posts = [
    ['1wq81lk', url('Sourdough', '1wq81lk', 'six_months_of_feeding_one_starter_what_i_learned'), at(2026, 9, 21, 8, 14, 3), '0.0.0.0', 'Sourdough', '0', 'Six months of feeding one starter: what I learned', '', 'Feeding at a 1:5:5 ratio twice a day kept it predictable.\n\nThe jar with the rubber band is still the best tool I own.'],
    ['1rk2b7x', url('woodworking', '1rk2b7x', 'my_first_hand_cut_dovetails_be_kind'), at(2026, 3, 2, 19, 40, 11), '0.0.0.0', 'woodworking', '1', 'My first hand-cut dovetails (be kind)', 'https://i.redd.it/sample-dovetails.jpg', ''],
    ['1h9x2mq', url('CampingandHiking', '1h9x2mq', 'trip_report_three_nights_in_the_rain'), at(2024, 12, 8, 7, 3, 54), '0.0.0.0', 'CampingandHiking', '0', 'Trip report: three nights in the rain', '', 'Everything got wet except the sleeping bag, which is the only thing that matters.\nNext time: a second pair of socks in a dry bag.'],
    ['17c4n2a', url('Python', '17c4n2a', 'a_tiny_script_that_renames_my_photos_by_date'), at(2023, 10, 20, 21, 12, 0), '0.0.0.0', 'Python', '0', 'A tiny script that renames my photos by date', '', 'It reads the EXIF date and falls back to the file date. Code in the comments, "works on my machine" applies.'],
    ['rk7a1b', url('houseplants', 'rk7a1b', 'before_and_after_one_year_of_my_window_shelf'), at(2021, 12, 19, 15, 0, 0), '0.0.0.0', 'houseplants', '0', 'Before and after: one year of my window shelf', 'https://i.redd.it/sample-shelf.jpg', ''],
    ['1t0zq9c', url('u_sample_saver_2026', '1t0zq9c', 'notes_to_self'), at(2026, 5, 3, 10, 0, 0), '0.0.0.0', 'u_sample_saver_2026', '0', 'Notes to self', '', 'Bread schedule: feed at 8, mix at 2, shape at 7, bake at 8 tomorrow.'],
  ];
  csv('posts.csv', ['id', 'permalink', 'date', 'ip', 'subreddit', 'gildings', 'title', 'url', 'body'], posts);
  csv('post_headers.csv', ['id', 'permalink', 'date', 'ip', 'subreddit', 'gildings', 'url'], posts.map(p => [p[0], p[1], p[2], p[3], p[4], p[5], p[7]]));

  // your comments
  const cm = [
    ['oq1a2b3', 'Sourdough', '1wq77aa', 'help_my_loaf_is_flat', 'Try a stiffer dough first: drop the water to 68% and see if the shape holds.', at(2026, 9, 20, 9, 1, 0)],
    ['op9z8y7', 'Sourdough', '1wp00ab', 'starter_smells_like_nail_polish', 'That is hunger, not spoilage. Feed it twice a day for a few days.', at(2026, 9, 12, 18, 30, 0)],
    ['on2c3d4', 'woodworking', '1vz1a2b', 'which_saw_for_dovetails', 'A Japanese pull saw (dozuki) was the easiest start for me.', at(2026, 8, 2, 20, 5, 0)],
    ['ok7e6f5', 'CampingandHiking', '1v1q2w3', 'best_cheap_rain_jacket', 'Frogg Toggs for the price, but it tears on brambles.', at(2026, 6, 14, 6, 45, 0)],
    ['ofa1b2c', 'personalfinance', '1u5t6y7', 'should_i_pay_off_my_car_early', 'Look at the rate first. Under 4% I would keep the cash in savings.', at(2026, 5, 1, 12, 0, 0)],
    ['nza9b8c', 'Python', '1ss1dd2', 'how_do_you_read_a_csv_with_line_breaks_in_fields', 'The csv module handles quoted line breaks, just open the file with newline="".\nSplitting on \\n by hand is what breaks it.', at(2026, 3, 30, 22, 10, 0)],
    ['nn3m4n5', 'houseplants', '1r8u9i0', 'what_is_this_plant', 'Looks like a Pilea peperomioides, the Chinese money plant.', at(2026, 2, 9, 11, 25, 0)],
    ['mxq1w2e', 'Breadit', '1pzx1c2', 'focaccia_dimples_disappear', 'Dimple right before it goes in, with oiled fingers, all the way to the pan.', at(2025, 11, 3, 17, 40, 0)],
    ['lr4t5y6', 'AskHistorians', '1j2k3l4', 'how_did_people_bake_before_commercial_yeast', 'Thank you, this is the clearest answer I have read on barm.', at(2025, 3, 10, 8, 0, 0)],
    ['kz9x8c7', 'DIY', '1ccv2b3', 'my_toilet_keeps_running', 'Replace the flapper first, it is the cause nine times out of ten.', at(2024, 4, 28, 14, 20, 0)],
    ['j0p9o8i', 'Cooking', '16a7s8d', 'what_knife_should_a_beginner_buy', 'A cheap Victorinox chef knife and a honing rod. Spend the rest on food.', at(2023, 9, 4, 19, 0, 0)],
    ['hqw2e3r', 'learnprogramming', 'v1b2n3', 'recursion_finally_clicked', 'Drawing the call stack on paper is what made it click for me too.', at(2022, 6, 18, 23, 15, 0)],
    ['g8h7j6k', 'bicycletouring', 'm4n5b6', 'first_tour_advice', 'Ride half the distance you think you can on day one.', at(2020, 12, 30, 10, 10, 0)],
    ['e1r2t3y', 'Sourdough', 'b7n8m9', 'is_my_starter_dead', 'Not dead, just sleepy. Warm spot and two feeds.', at(2019, 4, 2, 9, 0, 0)],
  ].map(([id, sub, pid, slug, body, date]) => [id, url(sub, pid, slug, id), date, '0.0.0.0', sub, '0', '0', '0', url(sub, pid, slug), `t3_${pid}`, body, '']);
  csv('comments.csv', ['id', 'permalink', 'date', 'ip', 'subreddit', 'gildings', 'gildings_silver', 'gildings_supergold', 'link', 'parent', 'body', 'media'], cm);
  csv('comment_headers.csv', ['id', 'permalink', 'date', 'ip', 'subreddit', 'gildings', 'gildings_silver', 'gildings_supergold', 'link', 'parent'], cm.map(c => c.slice(0, 10)));

  // votes
  const pv = [];
  for (let k = 0; k < 36; k++) { const sub = SUBS[k % SUBS.length]; const id = B36(POST_HIGH - k * 7919); pv.push([id, url(sub, id, pick(WORDS[sub])), k % 6 === 5 ? 'down' : k % 11 === 3 ? 'none' : 'up']); }
  csv('post_votes.csv', ['id', 'permalink', 'direction'], pv);
  const cv = [];
  for (let k = 0; k < 18; k++) { const sub = SUBS[(k * 5) % SUBS.length]; const pid = B36(POST_HIGH - k * 3301); const id = B36(COMMENT_HIGH - k * 104729); cv.push([id, url(sub, pid, pick(WORDS[sub]), id), k % 7 === 2 ? 'down' : 'up']); }
  csv('comment_votes.csv', ['id', 'permalink', 'direction'], cv);

  // archived private messages
  const msg = [
    ['2a1b3c', '', 't4_2a1b3c', at(2023, 2, 11, 10, 2, 0), '0.0.0.0', 'loafwright', SAMPLE_ACCOUNT, 'Your rye recipe', 'Hi! Could you share the rye recipe from your post? The 40% rye one.'],
    ['2a1b9x', '', 't4_2a1b3c', at(2023, 2, 11, 14, 37, 0), '0.0.0.0', SAMPLE_ACCOUNT, 'loafwright', 're: Your rye recipe', 'Sure: 400 g bread flour, 270 g rye, 470 g water, 130 g starter, 14 g salt.\nLong cold proof, 14 hours.'],
    ['2a1c02', '', 't4_2a1b3c', at(2023, 2, 12, 8, 5, 0), '0.0.0.0', 'loafwright', SAMPLE_ACCOUNT, 're: Your rye recipe', 'Baked it this morning. Best loaf I have made, thank you!'],
    ['1x9z8w', '', 't4_1x9z8w', at(2021, 7, 30, 16, 0, 0), '0.0.0.0', 'r_campingclub_mods', SAMPLE_ACCOUNT, 'Meetup next month', 'We are planning a meetup at the lake on the 21st. Reply here if you would like to come.'],
  ];
  csv('messages_archive.csv', ['id', 'permalink', 'thread_id', 'date', 'ip', 'from', 'to', 'subject', 'body'], msg);
  csv('messages_archive_headers.csv', ['id', 'permalink', 'thread_id', 'date', 'ip', 'from', 'to'], msg.map(m => m.slice(0, 7)));

  // chats
  const ch = 'sendbird_group_channel_sample_1';
  const ch2 = 'sendbird_group_channel_sample_2';
  csv('chat_history.csv', ['message_id', 'created_at', 'updated_at', 'username', 'message', 'thread_parent_message_id', 'channel_url', 'subreddit', 'channel_name', 'conversation_type'], [
    ['9001', at(2026, 4, 2, 19, 0, 0), '', 'trailmix_tess', 'Are you still selling the tent from your post?', '', ch, '', '', 'direct'],
    ['9002', at(2026, 4, 2, 19, 6, 0), '', SAMPLE_ACCOUNT, 'Yes, still have it. Two-person, used about ten nights.', '', ch, '', '', 'direct'],
    ['9003', at(2026, 4, 2, 19, 9, 0), '', 'trailmix_tess', 'Great, could I pick it up on Saturday?', '', ch, '', '', 'direct'],
    ['9004', at(2026, 4, 2, 19, 11, 0), '', SAMPLE_ACCOUNT, 'Saturday at 10 works.', '', ch, '', '', 'direct'],
    ['9101', at(2025, 10, 5, 12, 0, 0), '', 'crumbshot', 'Welcome to the bake-along chat, this week is bagels.', '', ch2, 'Breadit', 'Breadit bake-along', 'group'],
    ['9102', at(2025, 10, 5, 12, 4, 0), '', SAMPLE_ACCOUNT, 'In! Barley malt or honey in the water?', '', ch2, 'Breadit', 'Breadit bake-along', 'group'],
    ['9103', at(2025, 10, 5, 12, 9, 0), '', 'loafwright', 'Barley malt if you can find it, honey works.', '', ch2, 'Breadit', 'Breadit bake-along', 'group'],
  ]);

  // communities, feeds, drafts, account
  csv('subscribed_subreddits.csv', ['subreddit'], [...SUBS, 'AskReddit', 'books', 'gardening', 'ultralight', 'photography', 'learnpython'].map(s => [s]));
  csv('moderated_subreddits.csv', ['subreddit'], []);
  csv('approved_submitter_subreddits.csv', ['subreddit'], []);
  csv('multireddits.csv', ['id', 'display_name', 'date', 'description', 'privacy', 'subreddits', 'image_url', 'is_owner', 'favorited', 'followers'], [
    ['baking', 'Baking', at(2022, 1, 9), 'Everything bread', 'private', 'Sourdough,Breadit,Cooking', '', 'true', 'true', '0'],
  ]);
  csv('drafts.csv', ['id', 'title', 'body', 'kind', 'created', 'spoiler', 'nsfw', 'original_content', 'content_category', 'flair_id', 'flair_text', 'send_replies', 'subreddit', 'is_public_link'], [
    ['d1', 'Rye starter questions', 'Half-written: how often do you feed a rye starter in winter?', 'self', at(2026, 1, 12, 9, 0, 0), 'false', 'false', 'false', '', '', '', 'true', 'Sourdough', 'false'],
  ]);
  csv('friends.csv', ['username', 'note'], [['loafwright', '']]);
  csv('statistics.csv', ['statistic', 'value'], [
    ['account name', SAMPLE_ACCOUNT], ['export time', at(2026, 10, 29, 6, 12, 40)], ['is_deleted', 'False'],
    ['registration date', at(2014, 5, 2, 18, 33, 7)], ['email verified', 'True'], ['email address', 'sample@example.com'],
  ]);
  csv('ip_logs.csv', ['date', 'ip'], [[at(2026, 10, 28, 9, 0, 0), '0.0.0.0']]);
  csv('checkfile.csv', ['filename', 'sha256'], Object.keys(files).map(n => [n, '0'.repeat(64)]));
  return files;
}
