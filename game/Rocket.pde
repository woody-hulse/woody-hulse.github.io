class Rocket extends Bullet {
  
  ArrayList<Particle> rocketSmoke;
  boolean exploding;
  
  Rocket(PVector vel, PVector pos, float size, PVector dir, String origin, float damage) {
    super(vel, pos, size, dir, origin, damage);
    
    rocketSmoke = new ArrayList<Particle>();
    exploding = false;
  }
  
  void display() {
    
    if (exploding == false) {
    
      float c = random(0, 2);
        
      if (c > 1) rocketSmoke.add(new Particle(new PVector(pos.x - vel.x, pos.y - vel.y), color(150), 10, new PVector(-vel.x*0.1, -vel.y*0.1)));
      //else rocketSmoke.add(new particle(new PVector(pos.x, pos.y), color(99, 27, 0), 6, new PVector(-vel.x*0.2, -vel.y*0.2)));
      
      if (rocketSmoke.size() > 15) rocketSmoke.remove(0);
      
      for (Particle r : rocketSmoke) r.display();
      
      pushMatrix();
      translate(pos.x, pos.y);
      
      if (dir.x >= 0) rotate(atan(dir.y/dir.x));
      else rotate(atan(dir.y/dir.x) + PI);
      
      noStroke();
      if (origin.equals("player")) {
        if (powerupDuration[2] > 0) fill(255, 140, 0);
        else fill (playerColor);
        triangle(-size, -size*0.7, -size, size*0.7, size/1.73, 0);
      }
      else if (origin.equals("enemy")) {
        fill (enemyColor, 200);
        ellipse(0, 0, size, size);
      } else fill(115, 210);
      
      popMatrix();
    }
  }
  
    //checks if rocket has hit an object
  boolean hit() {
    
    if (exploding == false && origin.equals("player")) {
      for (Enemy e : enemies) {
        if (dist(pos.x, pos.y, e.pos.x, e.pos.y) < e.size/2 + size/2 + 5) {
          e.health -= damage;
          e.canHit = false;
          explosions.add(new Explosion(new PVector(pos.x, pos.y), damage*0.3, color(209, 70, 0)));
          exploding = true;
        }
      }
    
      if (pos.x > width || pos.x < 0 || pos.y > height || pos.y < 0) {
        explosions.add(new Explosion(pos, p.size/3, color(255)));
        exploding = true;
      }
    
    } else if (exploding) {
      for (Enemy e : enemies)
        if (dist(pos.x, pos.y, e.pos.x, e.pos.y) < damage)
          if (e.canHit) e.health -= (damage - dist(pos.x, pos.y, e.pos.x, e.pos.y))*2;
          else e.canHit = true;
          
      if (dist(pos.x, pos.y, p.pos.x, p.pos.y) < damage)
        p.health -= damage - dist(pos.x, pos.y, p.pos.x, p.pos.y);
        
      return true;
    }
    
    return false;
  }
}
