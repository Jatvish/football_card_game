import {createHash,randomBytes,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const scrypt=promisify(scryptCallback);
const root=dirname(fileURLToPath(import.meta.url));
const sha=value=>createHash('sha256').update(value).digest('hex');
const APP_TIME_ZONE=process.env.APP_TIME_ZONE||'Asia/Kolkata';
const today=()=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:APP_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day}`};
const dateKey=value=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
const starterPicks={F:[4,8,11],M:[3,7,10],D:[4,7,10,13],G:[2,5]};
const starterCardIds=cards=>Object.entries(starterPicks).flatMap(([category,indices])=>{
  const pool=cards.filter(c=>c.category===category).sort((a,b)=>b.ovr-a.ovr);
  return indices.map(i=>pool[Math.min(i,pool.length-1)]?.id).filter(Boolean);
});
const validSquad=(ids,owned,cards)=>{
  if(!Array.isArray(ids)||ids.length!==12||new Set(ids).size!==12||ids.some(id=>!owned.includes(id)))return false;
  const counts=Object.fromEntries(['F','M','D','G'].map(cat=>[cat,ids.filter(id=>cards.find(c=>c.id===id)?.category===cat).length]));
  return counts.F===3&&counts.M===3&&counts.D===4&&counts.G===2;
};
const achievementCatalog={
  first_win:{name:'First Whistle',description:'Win your first ranked match.'},
  streak_3:{name:'On a Roll',description:'Win three ranked matches in a row.'},
  wins_10:{name:'Club Regular',description:'Win ten ranked matches.'},
  collection_25:{name:'Scout Network',description:'Unlock 25 different player cards.'},
  collection_50:{name:'Full Album',description:'Collect all 50 player cards.'},
  mission_hero:{name:'Mission Hero',description:'Complete all daily missions in one day.'}
};

export async function createDatabase(cards){
  const connectionString=process.env.DATABASE_URL;
  if(!connectionString)return null;
  const {Pool}=await import('pg');
  const parsed=new URL(connectionString);
  const ssl=parsed.searchParams.get('sslmode')==='require'||/neon\.tech$/i.test(parsed.hostname)
    ?{rejectUnauthorized:false}:undefined;
  const pool=new Pool({connectionString,ssl,max:Number(process.env.PG_POOL_MAX||5),idleTimeoutMillis:30000,connectionTimeoutMillis:10000});
  await pool.query('SELECT 1');
  const migration=await readFile(join(root,'migrations','001_initial.sql'),'utf8');
  await pool.query(migration);

  async function transaction(fn){
    const client=await pool.connect();
    try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result}
    catch(error){await client.query('ROLLBACK');throw error}
    finally{client.release()}
  }
  async function hashPassword(password){
    const salt=randomBytes(16).toString('hex');
    const derived=await scrypt(password,salt,64);
    return `${salt}:${Buffer.from(derived).toString('hex')}`;
  }
  async function passwordMatches(password,stored){
    const [salt,hash]=String(stored||'').split(':');if(!salt||!hash)return false;
    const actual=Buffer.from(await scrypt(password,salt,64)),expected=Buffer.from(hash,'hex');
    return actual.length===expected.length&&timingSafeEqual(actual,expected);
  }
  async function newSession(client,accountId){
    const token=randomBytes(32).toString('base64url');
    await client.query(`INSERT INTO fw_sessions(token_hash,account_id,expires_at) VALUES($1,$2,now()+interval '30 days')`,[sha(token),accountId]);
    return token;
  }
  async function getDaily(client,accountId,lock=false){
    const day=today();
    await client.query(`INSERT INTO fw_daily_progress(account_id,day) VALUES($1,$2) ON CONFLICT DO NOTHING`,[accountId,day]);
    const result=await client.query(`SELECT * FROM fw_daily_progress WHERE account_id=$1 AND day=$2 ${lock?'FOR UPDATE':''}`,[accountId,day]);
    return result.rows[0];
  }
  async function grantLevelCards(client,accountId,oldXp,newXp){
    const oldLevel=Math.floor(oldXp/250)+1,newLevel=Math.floor(newXp/250)+1,unlocked=[];
    for(let level=oldLevel+1;level<=newLevel;level++){
      const result=await client.query(`SELECT card_id FROM fw_cards WHERE account_id=$1`,[accountId]);
      const owned=new Set(result.rows.map(x=>x.card_id));
      const locked=cards.filter(c=>!owned.has(c.id));if(!locked.length)break;
      const pick=locked[Math.floor(Math.random()*locked.length)];
      await client.query(`INSERT INTO fw_cards(account_id,card_id,source) VALUES($1,$2,'manager-level') ON CONFLICT DO NOTHING`,[accountId,pick.id]);
      unlocked.push(pick.id);
    }
    return unlocked;
  }
  async function profileWith(client,accountId,username){
    const [p,ownedRows,daily,masteryRows]=await Promise.all([
      client.query('SELECT * FROM fw_ranked_profiles WHERE account_id=$1',[accountId]),
      client.query('SELECT card_id FROM fw_cards WHERE account_id=$1 ORDER BY unlocked_at,card_id',[accountId]),
      getDaily(client,accountId),
      client.query('SELECT card_id,xp,appearances,goals,defensive_stops FROM fw_card_mastery WHERE account_id=$1',[accountId])
    ]);
    const row=p.rows[0];
    if(!row)throw Error('Ranked profile was not found.');
    const mastery=Object.fromEntries(masteryRows.rows.map(x=>[x.card_id,{xp:x.xp,level:Math.floor(x.xp/100)+1,appearances:x.appearances,goals:x.goals,defensiveStops:x.defensive_stops}]));
    return {username,owned:ownedRows.rows.map(x=>x.card_id),squad:row.squad||[],mastery,xp:row.xp,rating:row.rating,wins:row.wins,losses:row.losses,streak:row.streak,bestStreak:row.best_streak,packs:row.packs,achievements:row.achievements||[],level:Math.floor(row.xp/250)+1,daily:{date:dateKey(daily.day),plays:daily.matches,wins:daily.wins,goals:daily.goals,midfielderGoals:daily.midfielder_goals,defensiveStops:daily.defensive_stops,spinClaimed:daily.spin_claimed,spinResult:daily.spin_result,claimed:daily.claimed_missions||[]}};
  }
  async function register(username,password){
    const clean=String(username||'').trim();
    if(!/^[a-zA-Z0-9_]{3,18}$/.test(clean))throw Error('Choose a username with 3–18 letters, numbers or underscores.');
    if(typeof password!=='string'||password.length<10||password.length>128)throw Error('Password must contain at least 10 characters.');
    const passwordHash=await hashPassword(password),starter=starterCardIds(cards);
    return transaction(async client=>{
      let account;
      try{const result=await client.query('INSERT INTO fw_accounts(username,password_hash) VALUES($1,$2) RETURNING id,username',[clean.toLowerCase(),passwordHash]);account=result.rows[0]}
      catch(error){if(error.code==='23505')throw Error('That username is already taken.');throw error}
      const squad=starter;
      await client.query('INSERT INTO fw_ranked_profiles(account_id,squad) VALUES($1,$2::jsonb)',[account.id,JSON.stringify(squad)]);
      for(const id of starter)await client.query(`INSERT INTO fw_cards(account_id,card_id,source) VALUES($1,$2,'starter')`,[account.id,id]);
      const token=await newSession(client,account.id);
      return {token,user:{username:account.username},profile:await profileWith(client,account.id,account.username)};
    });
  }
  async function login(username,password){
    const result=await pool.query('SELECT id,username,password_hash FROM fw_accounts WHERE username=$1',[String(username||'').trim().toLowerCase()]);
    const account=result.rows[0];if(!account||!await passwordMatches(String(password||''),account.password_hash))throw Error('Username or password is incorrect.');
    return transaction(async client=>({token:await newSession(client,account.id),user:{username:account.username},profile:await profileWith(client,account.id,account.username)}));
  }
  async function session(token){
    if(typeof token!=='string'||token.length<30||token.length>100)return null;
    const result=await pool.query(`SELECT a.id,a.username FROM fw_sessions s JOIN fw_accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.expires_at>now()`,[sha(token)]);
    return result.rows[0]||null;
  }
  async function logout(token){if(token)await pool.query('DELETE FROM fw_sessions WHERE token_hash=$1',[sha(token)]);}
  async function getProfile(account){return profileWith(pool,account.id,account.username)}
  async function setSquad(account,ids){
    const profile=await getProfile(account);
    if(!validSquad(ids,profile.owned,cards))throw Error('Your squad must use only owned cards: 3 forwards, 3 midfielders, 4 defenders and 2 goalkeepers.');
    await pool.query('UPDATE fw_ranked_profiles SET squad=$2::jsonb,updated_at=now() WHERE account_id=$1',[account.id,JSON.stringify(ids)]);
    return getProfile(account);
  }
  async function claimSpin(account){
    return transaction(async client=>{
      const daily=await getDaily(client,account.id,true);
      if(daily.spin_claimed)throw Error('Your daily spin has already been claimed. Come back tomorrow.');
      const outcomes=[{type:'xp',amount:30,label:'30 Manager XP',weight:28},{type:'xp',amount:50,label:'50 Manager XP',weight:25},{type:'xp',amount:80,label:'80 Manager XP',weight:16},{type:'pack',amount:1,label:'One player pack',weight:18},{type:'xp',amount:120,label:'120 Manager XP',weight:8},{type:'pack',amount:2,label:'Two player packs',weight:5}];
      const total=outcomes.reduce((n,x)=>n+x.weight,0);let roll=Math.random()*total,reward=outcomes.at(-1);
      for(const item of outcomes){roll-=item.weight;if(roll<0){reward=item;break}}
      const p=await client.query('SELECT xp FROM fw_ranked_profiles WHERE account_id=$1 FOR UPDATE',[account.id]);
      const oldXp=p.rows[0].xp,newXp=oldXp+(reward.type==='xp'?reward.amount:0),packs=reward.type==='pack'?reward.amount:0;
      await client.query('UPDATE fw_ranked_profiles SET xp=$2,packs=packs+$3,updated_at=now() WHERE account_id=$1',[account.id,newXp,packs]);
      const unlocked=await grantLevelCards(client,account.id,oldXp,newXp);
      const spinResult={...reward,unlocked};
      await client.query('UPDATE fw_daily_progress SET spin_claimed=true,spin_result=$2::jsonb WHERE account_id=$1 AND day=$3',[account.id,JSON.stringify(spinResult),dateKey(daily.day)]);
      return {reward:spinResult,profile:await profileWith(client,account.id,account.username),outcomes:outcomes.map(({type,amount,label,weight})=>({type,amount,label,weight}))};
    });
  }
  async function openPack(account){
    return transaction(async client=>{
      const p=await client.query('SELECT packs FROM fw_ranked_profiles WHERE account_id=$1 FOR UPDATE',[account.id]);
      if(!p.rows[0]||p.rows[0].packs<1)throw Error('You do not have a player pack yet. Claim your daily spin; some spins award player packs.');
      const own=await client.query('SELECT card_id FROM fw_cards WHERE account_id=$1',[account.id]);
      const owned=new Set(own.rows.map(x=>x.card_id));
      const locked=cards.filter(c=>!owned.has(c.id));
      if(!locked.length)throw Error('You already own every player card.');
      const picks=[];
      for(let i=0;i<3&&locked.length;i++){
        const available=locked.filter(c=>!picks.includes(c));if(!available.length)break;
        // Packs guarantee one high-rated card when possible, then add two varied cards.
        let pool=available;
        if(i===0){const premium=available.filter(c=>c.ovr>=88);if(premium.length)pool=premium}
        const card=pool[Math.floor(Math.random()*pool.length)];picks.push(card);
      }
      for(const c of picks)await client.query(`INSERT INTO fw_cards(account_id,card_id,source) VALUES($1,$2,'player-pack') ON CONFLICT DO NOTHING`,[account.id,c.id]);
      await client.query('UPDATE fw_ranked_profiles SET packs=packs-1,updated_at=now() WHERE account_id=$1',[account.id]);
      return {cards:picks.map(c=>({id:c.id,name:c.name,position:c.position,ovr:c.ovr,rarity:c.ovr>=92?'Legendary':c.ovr>=88?'Elite':c.ovr>=84?'Rare':'Player'})),profile:await profileWith(client,account.id,account.username)};
    });
  }
  async function recordRankedResult(account,matchId,result){
    return transaction(async client=>{
      // Lock daily progress then the profile (same order as the daily spin) to
      // serialize per-account rewards without introducing a lock-order deadlock.
      const daily=await getDaily(client,account.id,true);
      const p=await client.query('SELECT * FROM fw_ranked_profiles WHERE account_id=$1 FOR UPDATE',[account.id]);
      const row=p.rows[0];if(!row)throw Error('Ranked profile was not found.');
      const duplicate=await client.query('SELECT 1 FROM fw_ranked_matches WHERE account_id=$1 AND match_id=$2',[account.id,matchId]);
      if(duplicate.rowCount)return {profile:await profileWith(client,account.id,account.username),reward:null};
      const won=!!result.won,score=won?24:-10,oldXp=row.xp,baseXp=won?110:60;
      const next={matches:daily.matches+1,wins:daily.wins+(won?1:0),goals:daily.goals+result.goals,midfielder_goals:daily.midfielder_goals+result.midfielderGoals,defensive_stops:daily.defensive_stops+result.defensiveStops};
      const missions=[
        ['play1',next.matches>=1,25,'Play one ranked match'],
        ['win1',next.wins>=1,35,'Win one ranked match'],
        ['goals2',next.goals>=2,30,'Score two goals'],
        ['midgoal',next.midfielder_goals>=1,25,'Score with a midfielder'],
        ['stops2',next.defensive_stops>=2,25,'Make two defensive stops'],
        ['wins2',next.wins>=2,50,'Win two ranked matches']
      ];
      const claimed=Array.isArray(daily.claimed_missions)?daily.claimed_missions:[];
      const newlyCompleted=missions.filter(([id,done])=>done&&!claimed.includes(id));
      const bonusXp=newlyCompleted.reduce((sum,m)=>sum+m[2],0),xp=baseXp+bonusXp,newXp=oldXp+xp;
      const ratingDelta=score,wins=row.wins+(won?1:0),losses=row.losses+(won?0:1),streak=won?row.streak+1:0,bestStreak=Math.max(row.best_streak,streak);
      const unlocked=await grantLevelCards(client,account.id,oldXp,newXp);
      const achievements=new Set(row.achievements||[]),newAchievements=[];
      const addAchievement=id=>{if(!achievements.has(id)){achievements.add(id);newAchievements.push({id,...achievementCatalog[id]})}};
      if(wins>=1)addAchievement('first_win');if(streak>=3)addAchievement('streak_3');if(wins>=10)addAchievement('wins_10');
      const ownCount=await client.query('SELECT count(*)::int AS count FROM fw_cards WHERE account_id=$1',[account.id]);
      if(ownCount.rows[0].count>=25)addAchievement('collection_25');if(ownCount.rows[0].count>=50)addAchievement('collection_50');
      if(missions.every(([id,done])=>done||claimed.includes(id)))addAchievement('mission_hero');
      const newClaimed=[...claimed,...newlyCompleted.map(m=>m[0])];
      await client.query(`UPDATE fw_daily_progress SET matches=$2,wins=$3,goals=$4,midfielder_goals=$5,defensive_stops=$6,claimed_missions=$7::jsonb WHERE account_id=$1 AND day=$8`,[account.id,next.matches,next.wins,next.goals,next.midfielder_goals,next.defensive_stops,JSON.stringify(newClaimed),dateKey(daily.day)]);
      await client.query(`UPDATE fw_ranked_profiles SET xp=$2,rating=greatest(0,rating+$3),wins=$4,losses=$5,streak=$6,best_streak=$7,achievements=$8::jsonb,updated_at=now() WHERE account_id=$1`,[account.id,newXp,ratingDelta,wins,losses,streak,bestStreak,JSON.stringify([...achievements])]);
      await client.query(`INSERT INTO fw_ranked_matches(account_id,match_id,won,score_for,score_against,goals,midfielder_goals,defensive_stops,mvp_card_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[account.id,matchId,won,result.scoreFor,result.scoreAgainst,result.goals,result.midfielderGoals,result.defensiveStops,result.mvpCardId||null]);
      for(const item of result.cardMastery||[]){
        await client.query(`INSERT INTO fw_card_mastery(account_id,card_id,xp,appearances,goals,defensive_stops) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(account_id,card_id) DO UPDATE SET xp=fw_card_mastery.xp+EXCLUDED.xp,appearances=fw_card_mastery.appearances+EXCLUDED.appearances,goals=fw_card_mastery.goals+EXCLUDED.goals,defensive_stops=fw_card_mastery.defensive_stops+EXCLUDED.defensive_stops,updated_at=now()`,[account.id,item.cardId,item.xp,item.appearances,item.goals,item.defensiveStops]);
      }
      return {profile:await profileWith(client,account.id,account.username),reward:{match:matchId,won,xp,rating:ratingDelta,streak,unlocked,missions:newlyCompleted.map(m=>({id:m[0],name:m[3],xp:m[2]})),achievements:newAchievements,mvpCardId:result.mvpCardId||null}};
    });
  }
  async function leaderboard(){
    const result=await pool.query(`SELECT a.username,p.rating,count(*) FILTER(WHERE m.won)::int AS wins,count(*) FILTER(WHERE NOT m.won)::int AS losses FROM fw_ranked_matches m JOIN fw_accounts a ON a.id=m.account_id JOIN fw_ranked_profiles p ON p.account_id=a.id WHERE m.created_at>=date_trunc('week',now()) GROUP BY a.id,a.username,p.rating ORDER BY wins DESC,p.rating DESC,count(*) DESC LIMIT 10`);
    return result.rows.map((x,i)=>({rank:i+1,username:x.username,rating:x.rating,wins:x.wins,losses:x.losses}));
  }
  return {pool,register,login,session,logout,getProfile,setSquad,claimSpin,openPack,recordRankedResult,leaderboard,close:()=>pool.end()};
}

export const dbInternals={starterCardIds,validSquad,achievementCatalog,dateKey};