// -----------------------------------------

class Bonus {
  
  PVector pos;
  float move;
  int amount;
  color c;
  
  Bonus (PVector pos, int amount, color c) {
    this.pos = pos;
    this.amount = amount;
    move = 2;
    this.c = c;
  }
  
  void display() {
    move *= 0.98;
    
    pos.add(new PVector(0, -move*gameSpeed));
    
    fill(c, move*16);
    textAlign(CENTER, CENTER);
    textSize(30 + sqrt(amount) * 2);
    text("+" + amount, pos.x, pos.y);
  }
  
  boolean isDead() {
    if (move < 0.1) return true;
    return false;
  }
}

// -----------------------------------------

class Boss1 extends Enemy {
  
  int phase = 1;
  float rotation;
  int timer;
  
  Boss1(PVector pos, float rate, float damage, float health, int value, float speed) {
    super(pos, rate, damage, health, value, speed);
    size = p.size*3 + damage/2;
    rotation = 0;
    timer = 0;
    canCombine = false;
  }
  
  void move() {
    
    if (error.x > 0) error.x += random(-0.12, 0.1);
    else error.x += random(-0.1, 0.12);
    if(error.y > 0) error.y += random(-0.12, 0.1);
    else error.y += random(-0.1, 0.12);
      
    dir = new PVector(p.pos.x - pos.x + error.x, p.pos.y - pos.y + error.y);
    dir.normalize();
      
    vel.add(new PVector((p.pos.x - pos.x)/width, (p.pos.y - pos.y)/height).normalize().mult(speed));
      
    vel.mult(.99);
      
    pos.add(new PVector(vel.x*gameSpeed, vel.y*gameSpeed));
      
    if (pos.x > width - size/2) vel.x = vel.x * -0.8 - 2;
    if (pos.x < size/2) vel.x = vel.x * -0.8 + 2;
    if (pos.y > height - size/2) vel.y = vel.y * -0.8 - 2;
    if (pos.y < size/2) vel.y = vel.y * -0.8 + 2;
    
    if (phase == 1) {
    
        shootTimer += gameSpeed;
      if (shootTimer > rate) {
        shootTimer = 0;
        enemies.add(new Enemy(new PVector(pos.x + dir.x*size, pos.y + dir.y*size), 80, 10, 60, 1, 0.07));
        explosions.add(new Explosion(new PVector(pos.x + dir.x*size, pos.y + dir.y*size), 30, color(255)));
      }
      
      if (health < 800) phase = 2;
      
    } else {
    
      if (rotation < PI*6) {
        rotation += 2/(rotation + 1);
      }
      
      shootTimer++;
      if (shootTimer > rate) {
        shootTimer = 0;
        bullets.add(new Bullet(new PVector(dir.x*speed*100 + vel.x, dir.y*speed*100 + vel.y).mult(2), new PVector(pos.x + dir.x*size, pos.y + dir.y*size), size/3, dir, "enemy", damage));
        bullets.add(new Bullet(new PVector(-dir.x*speed*100 - vel.x, dir.y*speed*100 + vel.y).mult(2), new PVector(pos.x - dir.x*size, pos.y + dir.y*size), size/3, dir, "enemy", damage));
        bullets.add(new Bullet(new PVector(dir.x*speed*100 + vel.x, -dir.y*speed*100 - vel.y).mult(2), new PVector(pos.x + dir.x*size, pos.y - dir.y*size), size/3, dir, "enemy", damage));
        bullets.add(new Bullet(new PVector(-dir.x*speed*100 - vel.x, -dir.y*speed*100 - vel.y).mult(2), new PVector(pos.x - dir.x*size, pos.y - dir.y*size), size/3, dir, "enemy", damage));
        
        explosions.add(new Explosion(new PVector(pos.x + dir.x*size, pos.y + dir.y*size), 20, color(168, 72, 50)));
        explosions.add(new Explosion(new PVector(pos.x - dir.x*size, pos.y + dir.y*size), 20, color(168, 72, 50)));
        explosions.add(new Explosion(new PVector(pos.x + dir.x*size, pos.y - dir.y*size), 20, color(168, 72, 50)));
        explosions.add(new Explosion(new PVector(pos.x - dir.x*size, pos.y - dir.y*size), 20, color(168, 72, 50)));
      }
    }
  
  }
  
  void display() {
    pushMatrix();
      translate(pos.x, pos.y);
      
      if (dir.x >= 0) rotate(atan(dir.y/dir.x) + rotation);
      else rotate(atan(dir.y/dir.x) + PI + rotation);
      
      noStroke();
      fill(180);
      if (phase == 1) quad(0, -size*0.4, size * 0.8, -size*0.2, size * 0.8, size*0.2, 0, size*0.4);
      else {
        rect(-size/4, size/2, size/2, size/8);
        rect(-size/4, -size/2, size/2, -size/8);
        rect(size/2, -size/4, size/8, size/2);
        rect(-size/2, -size/4, -size/8, size/2);
      }
      fill(168, 72, 50);
      ellipse(0, 0, size, size);
    
      fill(enemyColor);
      rect(-size/2, -size/2, size, size, 3);
    popMatrix();
    
    if (health > 0) {
      noStroke();
      fill(255 - health/maxHealth*255, health/maxHealth*255, 30);
      rect(pos.x-30, pos.y-5 + size*0.9, health/maxHealth*60, 10);
      stroke(60);
      strokeWeight(8);
      noFill();
      rect(pos.x-30, pos.y-5 + size*0.9, 60, 10);
    }
  }
}

// -----------------------------------------

class Bullet {
  
  PVector vel;
  PVector pos;
  float size;
    //which object shot the bullet ("player" or "enemy" usually)
  String origin;
    //direction of bullet
  PVector dir;
    //damage bullet can do
  float damage;
  
  Bullet (PVector vel, PVector pos, float size, PVector dir, String origin, float damage) {
    this.vel = vel;
    this.pos = pos;
    this.size = size + bulletDamage/10;
    this.origin = origin;
    this.dir = dir.normalize();
    this.damage = damage + bulletDamage;
    
    if (powerupDuration[2] > 0) vel.mult(1.5);
  }
  
  void move () {
    
    vel.mult(0.9999);
    
    pos.add(new PVector(vel.x, vel.y));
    
  }
  
  void display() {
    
    pushMatrix();
    translate(pos.x, pos.y);
    
    if (dir.x >= 0) rotate(atan(dir.y/dir.x));
    else rotate(atan(dir.y/dir.x) + PI);
   
    noStroke();
    if (origin.equals("player")) {
      if (powerupDuration[2] > 0) fill(255, 140, 0);
      else fill (playerColor);
      rect(-size/2, -size/2, size, size);
      if (powerupDuration[2] > 0) fill(240, 130, 0, 100);
      else fill (14, 106, 98, 100);
      triangle(size/2, size/2, size/2, -size/2, -dist(vel.x, vel.y, 0, 0) * 5, 0);
    }
    else if (origin.equals("enemy")) {
      fill (84, 36, 25, 100);
      triangle(0, size/2, 0, -size/2, -dist(vel.x, vel.y, 0, 0) * 5, 0);
      fill (enemyColor, 200);
      ellipse(0, 0, size, size);
    } else fill(115, 210);
    
    popMatrix();
    
    
  }
  
    //checks if bullet has hit an object
  boolean hit() {
    
    if (origin.equals("player")) {
      
      for (Enemy e : enemies) {
        if (dist(pos.x, pos.y, e.pos.x, e.pos.y) < e.size/2 + size/2 + 4) {
          e.health -= damage;
          explosions.add(new Explosion(new PVector(pos.x, pos.y), damage/2, playerColor));
          return true;
        }
      }
      
    } else if (origin.equals("enemy")) {
      if (dist(pos.x, pos.y, p.pos.x, p.pos.y) < p.size/2 + size/2 + 4) {
        
        if (powerupDuration[5] > 0) {
          powerupDuration[5] -= damage*3;
          explosions.add(new Explosion(new PVector(pos.x, pos.y), damage/2, color(20, 147, 201)));
        } else {
          p.health -= damage;
          explosions.add(new Explosion(new PVector(pos.x, pos.y), damage, enemyColor));
        }
        
        return true;
      }
    }
    
    if (pos.x > width || pos.x < 0 || pos.y > height || pos.y < 0) {
      explosions.add(new Explosion(pos, p.size/5, color(255, 150)));
      return true;
    }
    
    return false;
  }
}

// -----------------------------------------


class Coin {
  
  PVector pos;
  PVector movement;
  float size;
  
  Coin (PVector pos, boolean moving) {
    this.pos = new PVector(pos.x, pos.y);
    if (moving == true) movement = new PVector(random(-3, 3), random(-3, 3));
    else movement = new PVector(0, 0);
    size = 15;
  }
  
  void move() {
    movement.mult(0.97);
    pos.add(new PVector(movement.x*gameSpeed, movement.y*gameSpeed));
    
    if (pos.x > width - size/2 || pos.x < size/2) movement.x += -0.9;
    if (pos.y > height - size/2 || pos.y < size/2) movement.y += -0.9;
    
    if (powerupDuration[1] > 0) {
      
      if (dist(p.pos.x, p.pos.y, pos.x, pos.y) < size/2 + p.size/2 + 400) {
        movement.add(new PVector(p.pos.x - pos.x, p.pos.y - pos.y).div(400));
      }
    }
  }
  
  void display() {
    pushMatrix();
    translate(pos.x, pos.y);
    stroke(156, 96, 0);
    strokeWeight(3);
    fill(255, 195, 15);
    ellipse(0, 0, size, size);
    popMatrix();
  }
  
  boolean collected() {
    
    if (dist(p.pos.x, p.pos.y, pos.x, pos.y) < size/2 + p.size/2 + 15) {
      bonuses.add(new Bonus(new PVector(width-50, height-120), 1, color(255)));
      return true;
    }
    return false;
  }
  
}

// -----------------------------------------

class Enemy {
  
  PVector vel;
  PVector pos;
  float health;
  float speed;
  float size;
  PVector dir;
  PVector error;
  float rate;
  float damage;
  float shootTimer;
  float maxHealth;
  int value;
  boolean canCombine;
  boolean canHit;
  
  Enemy(PVector pos, float rate, float damage, float health, int value, float speed) {
    this.pos = pos;
    this.rate = rate;
    this.damage = damage;
    vel = new PVector(0, 0);
    this.health = health;
    maxHealth = health;
    this.speed = speed;
    size = p.size - 10 + damage/2;
    shootTimer = rate;
    this.value = value;
    
    error = new PVector(0, 0);
    canCombine = true;
    canHit = true;
  }
  
  void move() {
    
    if (error.x > 0) error.x += random(-0.12, 0.1);
    else error.x += random(-0.1, 0.12);
    if(error.y > 0) error.y += random(-0.12, 0.1);
    else error.y += random(-0.1, 0.12);
    
    dir = new PVector(p.pos.x - pos.x + error.x, p.pos.y - pos.y + error.y);
    dir.normalize();
    
    vel.add(new PVector((p.pos.x - pos.x)/width, (p.pos.y - pos.y)/height).normalize().mult(speed));
    
    vel.mult(.99);
    
    pos.add(new PVector(vel.x*gameSpeed, vel.y*gameSpeed));
    
    if (pos.x > width - size/2) vel.x = vel.x * -0.8 - 2;
    if (pos.x < size/2) vel.x = vel.x * -0.8 + 2;
    if (pos.y > height - size/2) vel.y = vel.y * -0.8 - 2;
    if (pos.y < size/2) vel.y = vel.y * -0.8 + 2;
    
    shootTimer += gameSpeed;
    if (shootTimer > rate) {
      shootTimer = 0;
      bullets.add(new Bullet(new PVector(dir.x*speed*100 + vel.x, dir.y*speed*100 + vel.y), new PVector(pos.x + dir.x*10, pos.y + dir.y*30), size/3, dir, "enemy", damage));
      explosions.add(new Explosion(new PVector(pos.x + dir.x*10, pos.y + dir.y*10), 6, color(168, 72, 50)));
    }
  
  }
  
  void display() {
    pushMatrix();
    translate(pos.x, pos.y);
    
    if (health > 0) {
      noStroke();
      fill(255 - health/maxHealth*255, health/maxHealth*255, 30);
      rect(-15, -2.5 + size*0.9, health/maxHealth*30, 5);
      stroke(60);
      strokeWeight(4);
      noFill();
      rect(-15, -2.5 + size*0.9, 30, 5);
    }
    
    pushMatrix();
    if (dir.x >= 0) rotate(atan(dir.y/dir.x));
    else rotate(atan(dir.y/dir.x) + PI);
    
    noStroke();
    fill(180);
    quad(0, -size*0.4, size * 0.8, -size*0.2, size * 0.8, size*0.2, 0, size*0.4);
    fill(168, 72, 50);
    ellipse(0, 0, size, size);
    popMatrix();
    
    popMatrix();
  }
  
  boolean isDead() {
    if (health <= 0) return true;
    
    return false;
  }

    //checks if enemy has collided with player
  void checkCollision(Player u) {

    PVector distanceVect = PVector.sub(u.pos, pos);

    float distanceVectMag = distanceVect.mag();

    float minDistance = size/2 + u.size/2;
    
    float m = size*0.05;
    float um = u.size*0.05;

    if (distanceVectMag < minDistance) {
      float distanceCorrection = (minDistance-distanceVectMag)/2.0;
      PVector d = distanceVect.copy();
      PVector correctionVector = d.normalize().mult(distanceCorrection);
      u.pos.add(correctionVector);
      pos.sub(correctionVector);

      float theta  = distanceVect.heading();
      float sine = sin(theta);
      float cosine = cos(theta);

      PVector[] bTemp = {
        new PVector(), new PVector()
      };

      bTemp[1].x  = cosine * distanceVect.x + sine * distanceVect.y;
      bTemp[1].y  = cosine * distanceVect.y - sine * distanceVect.x;

      PVector[] vTemp = {
        new PVector(), new PVector()
      };

      vTemp[0].x  = cosine * vel.x + sine * vel.y;
      vTemp[0].y  = cosine * vel.y - sine * vel.x;
      vTemp[1].x  = cosine * u.vel.x + sine * u.vel.y;
      vTemp[1].y  = cosine * u.vel.y - sine * u.vel.x;

      PVector[] vFinal = {  
        new PVector(), new PVector()
      };

      vFinal[0].x = ((m - um) * vTemp[0].x + 2 * um * vTemp[1].x) / (m + um);
      vFinal[0].y = vTemp[0].y;

      vFinal[1].x = ((um - m) * vTemp[1].x + 2 * m * vTemp[0].x) / (m + um);
      vFinal[1].y = vTemp[1].y;

      bTemp[0].x += vFinal[0].x;
      bTemp[1].x += vFinal[1].x;

      PVector[] bFinal = { 
        new PVector(), new PVector()
      };

      bFinal[0].x = cosine * bTemp[0].x - sine * bTemp[0].y;
      bFinal[0].y = cosine * bTemp[0].y + sine * bTemp[0].x;
      bFinal[1].x = cosine * bTemp[1].x - sine * bTemp[1].y;
      bFinal[1].y = cosine * bTemp[1].y + sine * bTemp[1].x;

      u.pos.x = pos.x + bFinal[1].x;
      u.pos.y = pos.y + bFinal[1].y;

      pos.add(bFinal[0]);

      vel.x = cosine * vFinal[0].x - sine * vFinal[0].y;
      vel.y = cosine * vFinal[0].y + sine * vFinal[0].x;
      u.vel.x = cosine * vFinal[1].x - sine * vFinal[1].y;
      u.vel.y = cosine * vFinal[1].y + sine * vFinal[1].x;
      
        //subtracts health from player and enemy
      if (using == 1) health -= 100;
      else health -= 20;
      if (p.boost == false || using != 1) p.health -= 20;
    }
  }
}

// -----------------------------------------

class Explosion {
  
  PVector pos;
    //upper bound of particle size
  float size;
  int num;
  color c;
  int deathClock = 200;
    //reset variable for camera shake
  float cameraShakeTimer;
    //how much camera shake
  float mag;
  
  ArrayList<Particle> boom;
  
  Explosion(PVector pos, float size, color c) {
    this.pos = pos;
    this.size = size;
    this.c = c;
    cameraShakeTimer = 3;
    mag = size/150;
    
    num = 8;
    
    boom = new ArrayList<Particle>();
    
    for (int i = 0; i < num; i ++) 
      boom.add(new Particle(new PVector(pos.x + random(-size, size), pos.y + random(-size, size)), c, size*2, new PVector(0, 0)));
    
  }
  
  void move() {
    
    for (Particle f : boom) {
      if (pause == false) f.move();
      f.display();
    }
    
    deathClock -= gameSpeed;
    
    cameraShakeTimer += gameSpeed;
  }
  
  void quake() {
    
    if (pos.x < 5 || pos.y < 5 || pos.x > width-5 || pos.y > height-5) {} else {
      translate(sin(cameraShakeTimer/2)/cameraShakeTimer*65*mag*gameSpeed, sin(cameraShakeTimer/3)/cameraShakeTimer*90*mag*gameSpeed);
      translate(width/2, height/2);
      rotate(sin(cameraShakeTimer/15)/cameraShakeTimer*mag*0.6*gameSpeed);
      translate(-width/2, -height/2);
    }
  }
  
  boolean isDead() {
    if (deathClock <= 0) return true;
    
    return false;
  }
}

// -----------------------------------------

class Gun {
  
    //is the player holding the weapon
  boolean carrying;
    //location of weapon (equal to player if carrying)
  PVector pos;
    //spinny animation
  float groundAnimation;
    //direction pointed
  PVector dir;
    //damage
  float damage;
    //bullet speed
  float speed;
    //size of weapon
  float size;
  
    //time takes to reload
  float shootTime;
    //reload timer
  float shootTimer;
    //if false player can shoot
  boolean canShoot = true;
  
    //capacity of gun
  int capacity;
    //ammunition left
  int ammo;
    //reload
  boolean reload = false;
    //reload timer
  float reloadTimer;
    //if player reloads
  boolean reloading;
    //adds damage when colliding with enemy
  boolean canStab;
    //size of particles for each shot
  int shellSize = 6;
  
  int offset;
  
  Gun(PVector pos) {
    carrying = true;
    if (carrying == false) this.pos = pos;
    
    reloadTimer = 100;
    dir = new PVector(1, 0);
  }
  
  void move() {
    
    if (!mobile)
      dir = new PVector(mouseX - p.pos.x, mouseY - p.pos.y);
    else if (closestEnemy != null)
      dir = new PVector(closestEnemy.pos.x = p.pos.x, closestEnemy.pos.y - p.pos.y);
    dir.normalize();
    
    if (carrying == true) {
      
      if (keyPressed && key == 'e' && canShoot == true && (ammo > 0 || powerupDuration[2] > 0) && reloading == false) {
        bullets.add(new Bullet(new PVector(dir.x*speed, dir.y*speed), new PVector(p.pos.x + dir.x*10, p.pos.y + dir.y*30), 80/speed + 2, dir, "player", damage));
        explosions.add(new Explosion(new PVector(p.pos.x + dir.x*20, p.pos.y + dir.y*20), shellSize, color(28, 212, 196)));
        if (powerupDuration[2] <= 0) ammo --;
        canShoot = false;
      }
      
      if (keyPressed && key == 'w' && reloading == false) {
        reloading = true;
        reloadTimer = 80 - ammo/capacity*80;
      }
      
      if (reloading == true) {
        reloadTimer -= gameSpeed;
        
        if (reloadTimer < 0) {
          reloadTimer = 80;
          ammo = capacity;
          reloading = false;
        }
      }
      
      if (canShoot == false) {
        shootTimer -= 1;
        if (shootTimer < 0) {
          canShoot = true;
          shootTimer = shootTime;
        }
      }
      
    } else {
      
      if (dist(pos.x, pos.y, p.pos.x, p.pos.y) < 40)
        if (keyPressed && keyCode == SHIFT) {
          weapons.remove(carried);
          carrying = true;
          carried = this;
        }
      
    }
    
  }
  
  void display() {
    
    if (capacity > 0) {
      
      for (int i = 0; i < capacity; i++) {
        
        if (i < ammo) stroke(0, 100, 0, 150);
        else stroke(100, 0, 0, 150);
        
        noFill();
        strokeWeight(6);
        
        if (powerupDuration[2] > 0) {
          ammo = capacity;
          stroke(255, 140, 0);
        }
        
        arc(p.pos.x, p.pos.y, p.size + 30, p.size + 30, PI/2 + i*(PI/15) + (TWO_PI - (capacity)*(PI/15))/capacity * i, PI/2 + i*(PI/15) + (TWO_PI - (capacity)*(PI/15))/capacity * (i+1));
        
      }
      
      noFill();
      stroke(100, 150);
      arc(p.pos.x, p.pos.y, p.size + 45, p.size + 45, PI/2, PI/2 + TWO_PI*(80 - reloadTimer)/80);
    }
    
      strokeWeight(6);
    if (powerupDuration[5] > 0) {
      stroke(20, 147, 201);
      noFill();
      ellipse(p.pos.x, p.pos.y, p.size + 15, p.size + 15);
    } else {
      stroke(30);
      noFill();
      ellipse(p.pos.x, p.pos.y, p.size + 15, p.size + 15);
    }
        
  }
}


// -----------------------------------------


class Knife extends Gun {
  
    //is knife thrown
  boolean thrown;
    //direction knife is thrown
  PVector direction;
    //where knife is thrown from
  PVector returnPoint;
    //how fast is knife
  float speed;
    //how long before knife runs out of energy
  float dropTimer;
  
  Knife(PVector pos) {
    super(pos);
    
    thrown = false;
    offset = -6;
    speed = 20;
    dropTimer = 0;
    damage = 50;
    canStab = true;
    size = p.size*0.8;
  }
  
  void move() {
    
    if (!mobile)
      dir = new PVector(mouseX - p.pos.x, mouseY - p.pos.y);
    else if (closestEnemy != null)
      dir = new PVector(closestEnemy.pos.x = p.pos.x, closestEnemy.pos.y - p.pos.y);
    dir.normalize();
    
    if (carrying == true) {
      
      if (keyPressed && key == 'e' && thrown == false) {
        thrown = true;
        pos = new PVector(p.pos.x, p.pos.y);
        direction = new PVector(dir.x, dir.y);
        groundAnimation = 0;
        returnPoint = new PVector(p.pos.x, p.pos.y);
        dropTimer = 0;
        carrying = false;
        if (powerupDuration[2] <= 0) speed = 20;
        else speed = 40;
      }
      
    }
    
    if (thrown == true) {
      
    carrying = false;
    speed *= 0.98;
        
      pos.add(new PVector (direction.normalize().mult(speed).x*(gameSpeed/2+0.5), direction.normalize().mult(speed).y*(gameSpeed/2+0.5)));
        
      for (Enemy e : enemies) {
        if (dist(e.pos.x, e.pos.y, pos.x, pos.y) < p.size/2 + e.size/2 + 5) {
          e.health -= damage;
          carrying = false;
          speed *= 0.7;
          direction.x = random(0, TWO_PI);
          direction.y = random(0, TWO_PI);
          direction.normalize();
          pos.add(new PVector(direction.x * e.size/3, direction.y * e.size/3));
          explosions.add(new Explosion(pos, 15, color(255))); 
        }
      }
      
      if (pos.x > width-p.size/2 || pos.x < p.size/2) { direction.x *= -1; speed *= 0.9; pos.add(direction); }
      if (pos.y > height-p.size/2 || pos.y < p.size/2) { direction.y *= -1; speed *= 0.9; pos.add(direction); }
      
      if (speed < 0.5) thrown = false;
    }
    
    if (carrying == false) {
      if (dist(p.pos.x, p.pos.y, pos.x, pos.y) <= p.size/2 + size/2 + 20) {
        carrying = true;
        if (speed <= 12) speed = 0;
      }
      
      canStab = false;
    } else canStab = true;
  }
  
  void display() {
    
    super.display();
    
    pushMatrix();
        
    if (carrying == true) {

      translate(p.pos.x, p.pos.y);
        
      if (dir.x >= 0) rotate(atan(dir.y/dir.x));
      else rotate(atan(dir.y/dir.x) + PI);
      
    } else {
      
      if (thrown == true) {
        
        translate(pos.x, pos.y);
        
        groundAnimation += 0.2;
        
      } else {
        translate(pos.x, pos.y);
      }
      
    }
    
    if (carrying == false) {
      
      PVector throwAngle = new PVector(direction.x, direction.y);
      throwAngle.normalize();
      
      if (throwAngle.x >= 0) rotate(atan(throwAngle.y/throwAngle.x));
      else rotate(atan(throwAngle.y/throwAngle.x) + PI);
      
      rotate(speed);
    }
    
    noStroke();
    fill(102, 60, 0);
    rect(-size*0.15, -size*0.7, size*0.3, size*0.6);
    fill(100);
    ellipse(0, -size*0.7, size*0.5, size*0.5);
    if (powerupDuration[2] <= 0) fill(playerColor);
    else fill(255, 140, 0);
    ellipse(0, -size*0.7, size*0.2, size*0.2);
    fill(150);
    quad(0, -size*0.1, -size*0.2, -size*0.1, -size*0.13, size*0.5, 0, size*0.7);
    fill(110);
    quad(0, -size*0.1, size*0.2, -size*0.1, size*0.13, size*0.5, 0, size*0.7);
    fill(130);
    triangle(0, -size*0.3, -size*0.4, -size*0.1, size*0.4, -size*0.1);
    popMatrix();
    
  }
}


// -----------------------------------------

class MachineGun extends Gun {
  
  MachineGun(PVector pos) {
    super(pos);
    
    damage = 5;
    speed = 20;
    shootTime = 2;
    shootTimer = shootTime;
    capacity = 80;
    ammo = capacity;
    shellSize = 4;
    size = p.size;
  }
  
  void move() {
    
    super.move();
    
    if (carrying == true) {
      
      if (keyPressed && keyCode == 'e') p.vel.mult(0.93);
      else p.vel.mult(0.97);
    }

  }
  
  void display() {
    
    super.display();
        
    pushMatrix();
    
    if (carrying == true) {
      
      translate(p.pos.x, p.pos.y + 5);
          
      if (dir.x >= 0) rotate(atan(dir.y/dir.x));
      else rotate(atan(dir.y/dir.x) + PI);
    }
    
      if (carrying == false) {
        pushMatrix();
        stroke(60);
        rotate(PI/6);
        rect(-size*0.15, 0, size*0.3, size*0.6, 3);
        popMatrix();
      }
    stroke(60);
    strokeWeight(1);
      line(0, -8.75, size*1.34, -8.75);
      line(0, 8.75, size*1.34, 8.75);
    stroke(90);
    strokeWeight(2);
      noStroke();
    fill(50);
      rect(size*0.7, -size*0.5, size*0.1, size, 5);
    stroke(150);
    strokeWeight(4);
      line(0, 0, size*1.399, 0);
    stroke(120);
    strokeWeight(3.5);
      line(0, -3.5, size*1.39, -3.5);
      line(0, 3.5, size*1.39, 3.5);
    stroke(90);
    strokeWeight(2.5);
      line(0, -6.5, size*1.37, -6.5);
      line(0, 6.5, size*1.37, 6.5);
    stroke(30);
    fill(0);
      rect(-1, -8 + (float)ammo/capacity*16, 9, 14, 5);
      noStroke();
    fill(163);
      rect(-size/3, -size/3, size/3*2, size/3*2, 5);
    fill(100);
      rect(-size/4, -size/4, size, size/2, 5);
    
    popMatrix();
  }
}

// -----------------------------------------


class Particle {
  
  PVector pos;
  color c;
  float size;
  float health;
  PVector vel;
  float rotation;
  
  Particle(PVector pos, color c, float size, PVector vel) {
    this.pos = pos;
    this.c = c;
    this.size = random(size*0.8, size*1.5);
    health = 210;
    this.vel = new PVector(random(-size/2 + vel.x, size/2 + vel.x), random(-size/2 + vel.y, size/2 + vel.y));
    rotation = random(0, TWO_PI);
  }
  
  void move() {
    
    vel.mult(0.91);
    size *= 0.964;
    pos.add(new PVector(vel.x*gameSpeed, vel.y*gameSpeed));
    if (vel.mag() < 0.7) health *= 0.92;
}
    
void display() {
    
    pushMatrix();
    translate(pos.x, pos.y);
    rotate(vel.mag()*gameSpeed + rotation);
    
    noStroke();
    fill(c);
    rect(-size/2, -size/2, size, size);
    
    popMatrix();
  }
  
}

// -----------------------------------------


class Pistol extends Gun{
  
  Pistol (PVector pos) {
    super(pos);

    shootTime = 15;
    shootTimer = shootTime;
    damage = 15;
    speed = 15;
    offset = -6;
    capacity = 10;
    ammo = capacity;
    shellSize = 10;
    size = p.size*0.8;
  }
  
  void display() {
    
    super.display();
    
    if (carrying == true) {
      pushMatrix();
      translate(p.pos.x, p.pos.y);
      if (dir.x >= 0) rotate(atan(dir.y/dir.x));
      else rotate(atan(dir.y/dir.x) + PI);
    
      noStroke();
      fill(180, 230);
      rect(0, 0, size*1.2, size*0.4);
      rect(0, size*0.4, size*0.5, size*0.2);
      rect(0, size*0.5, size*0.8, size*0.05);
      fill(110, 230);
      rect(size*0.1, size*0.1, size*0.7, size*0.2);
      popMatrix();
    }
  }
}


// -----------------------------------------


class Player {
  
  PVector vel;
  PVector pos;
  float health;
  float size;
  float charge;
  
  boolean boost;
  float boostTimer;
  
  float pauseTime;
  
  Player(PVector pos) {
    this.pos = pos;
    vel = new PVector(0, 0);
    health = 200;
    
    size = 50;
  }
  
  void keyPressed() {
    if (key == ' ' && charge >= 300) {
      PVector boostDirection = new PVector(mouseX - pos.x, mouseY - pos.y);
      boost = true;
      boostTimer = charge;
      
      vel.mult(0.2);
      vel.add(boostDirection.normalize().mult(charge/6));
      explosions.add(new Explosion(pos, charge/9, color(209, 70, 0)));
      
      charge = 0;
    }
  }
  
  void move() {
    
    if (boostTimer > 0) boostTimer -= gameSpeed;
    else boost = false;
    
    if (mousePressed) vel.add((mouseX - pos.x)/width, (mouseY - pos.y)/height);
    
    if (boost == false) {
      if (charge < 300) charge += gameSpeed;
    }
      pos.add(new PVector(vel.x*gameSpeed, vel.y*gameSpeed));
    
    vel.mult(.99);
    
    if (pos.x > width - size/2) vel.x = vel.x * -0.8 - 2;
    if (pos.x < size/2) vel.x = vel.x * -0.8 + 2;
    if (pos.y > height - size/2) vel.y = vel.y * -0.8 - 2;
    if (pos.y < size/2) vel.y = vel.y * -0.8 + 2;
    
  
  }
  
  void display() {
    
    pushMatrix();
    translate(pos.x, pos.y);
    
    noStroke();
    fill(28, 212, 196);
    ellipse(0, 0, size, size);
    fill(15, 195, 170);
    arc(0, 0, size*0.4, size*0.4, PI/2, PI/2 + charge/300*TWO_PI);
    
    popMatrix();
  }
  
  void slowMo() {
    
    if (boost == true) {
      pauseTime += 0.01;
      
      scale(1 + pauseTime*(1-pauseTime)*0.22);
      gameSpeed = 1 - pauseTime*(1-pauseTime)*3.6;
      //translate((width/2 - pos.x)*(sin(pauseTime*TWO_PI)/10), (height/2 - pos.y)*(sin(pauseTime*TWO_PI)/10));
      
      if (pauseTime >= 1) {
        pauseTime = 0;
        boost = false;
      }
    }
  }
  
  boolean isDead() {
    if (health <= 0) return true;
    
    else return false;
  }
}


// -----------------------------------------

class Powerup {
  
  PVector pos;
  
    //size
  float s;
    //rotation
  float w;
    //colors
  color c1, c2;
    //type
  int type;
  boolean increasing = false;
  
  Powerup(PVector pos, int type) {
    this.pos = pos;
    this.type = type;
    s = p.size*0.8;
    w = 1;
    
      //coin magnet
    if (type == 1) c1 = color(205, 55, 7);
      //infinite ammo
    if (type == 2) c1 = color(255, 140, 0);
      //mega coin
    if (type == 3) c1 = color(255, 195, 15);
      //regen
    if (type == 4) c1 = color(7, 186, 55);
      //sheild
    if (type == 5) c1 = color(20, 147, 201);
  }
  
  void display() {
    
    if (pause == false) {
      if (increasing == true) w += 0.01*gameSpeed;
      else w -= 0.01*gameSpeed;
    }
    
    if (w < 0.1) increasing = true;
    if (w > 1) increasing = false;
    
    pushMatrix();
    translate(pos.x, pos.y);
      
    stroke(c1);
    strokeWeight(s/8 + 1.4);
    noFill();
    ellipse(0, 0, s, s);
    
    popMatrix();
    
  }
  
  boolean used() {
    if (dist(p.pos.x, p.pos.y, pos.x, pos.y) < s + p.size) {
      
        //coin magnet
      if (type == 1) {
        
        powerupDuration[1] = 1000;
        
        for (int i = 0; i < active.length; i++) {
          if (active[i] == 0 || active[i] == type) {
            active[i] = type;
            i = active.length;
          }
        }
        
        //infinite ammo
      } else if (type == 2) {
        
        powerupDuration[2] = 1000;
        
        for (int i = 0; i < active.length; i++) {
          if (active[i] == 0 || active[i] == type) {
            active[i] = type;
            i = active.length;
          }
        }
        
        //mega coin
      } else if (type == 3) {
        
        collectedCoins += amount[type];
        bonuses.add(new Bonus(new PVector(width-50, height-80), amount[type], color(255)));
        
        //regen
      } else if (type == 4) {
        
        if (p.health > 150) { 
          p.health = 200; 
          bonuses.add(new Bonus(new PVector(width/2 - 500 + p.health*4, 50), floor(200 - p.health), color(255)));
        } else {
          p.health += amount[type];
          bonuses.add(new Bonus(new PVector(width/2 - 500 + p.health*4, 50), amount[type], color(255)));
        }
        
        //sheild
      } else if (type == 5) {
        
        powerupDuration[5] = 1000;
        
        for (int i = 0; i < active.length; i++) {
          if (active[i] == 0 || active[i] == type) {
            active[i] = type;
            i = active.length;
          }
        }
        
      }
     
      explosions.add(new Explosion(new PVector(pos.x, pos.y), s/6, c1));
      
      return true;
    }
    
    return false;
  }
}


// -----------------------------------------


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


// -----------------------------------------


class RocketLauncher extends Gun {
  
  RocketLauncher(PVector pos) {
    super(pos);
    
    
    shootTime = 50;
    shootTimer = shootTime;
    damage = 100;
    speed = 15;
    offset = -6;
    capacity = 1;
    ammo = capacity;
    size = p.size;
  }
  
  void move() {
    
    if (!mobile)
      dir = new PVector(mouseX - p.pos.x, mouseY - p.pos.y);
    else if (closestEnemy != null)
      dir = new PVector(closestEnemy.pos.x = p.pos.x, closestEnemy.pos.y - p.pos.y);
    dir.normalize();
    
    if (carrying == true) {
      
      if (keyPressed && key == 'e' && canShoot == true && ammo > 0 && reloading == false) {
        bullets.add(new Rocket(new PVector(dir.x*speed, dir.y*speed), new PVector(p.pos.x + dir.x*10, p.pos.y + dir.y*30), 70/speed * 3, dir, "player", damage));
        if (powerupDuration[2] > 0)  explosions.add(new Explosion(new PVector(p.pos.x + dir.x*20, p.pos.y + dir.y*20), shellSize, color(255, 140, 0)));
        else explosions.add(new Explosion(new PVector(p.pos.x + dir.x*20, p.pos.y + dir.y*20), shellSize, color(28, 212, 196)));
        ammo --;
        canShoot = false;
      }
      
      if (keyPressed && key == 'w' && reloading == false) {
        reloading = true;
        reloadTimer = 80 - ammo/capacity*80;
      }
      
      if (reloading == true) {
        reloadTimer -= gameSpeed;
        
        if (reloadTimer < 0) {
          reloadTimer = 80;
          ammo = capacity;
          reloading = false;
        }
      }
      
      if (canShoot == false) {
        shootTimer -= gameSpeed;
        if (shootTimer < 0) {
          canShoot = true;
          shootTimer = shootTime;
        }
      }
      
    } else {
      
      if (dist(pos.x, pos.y, p.pos.x, p.pos.y) < 40)
        if (keyPressed && keyCode == SHIFT) {
          weapons.remove(carried);
          carrying = true;
          carried = this;
        }
    }   
  }
  
  void display() {
    
    super.display();
    
    if (carrying == true) {
      pushMatrix();
      translate(p.pos.x + 6, p.pos.y + 1);
      if (dir.x >= 0) rotate(atan(dir.y/dir.x));
      else rotate(atan(dir.y/dir.x) + PI);
    
      noStroke();
      fill(165);
      triangle(-size*0.8, -size*0.25, -size*0.77, size*0.25, -size*0.4, 0);
      fill(145);
      rect(-size*0.6, -size*0.15, size*1.4, size*0.3);
      fill(100);
      rect(-size*0.1, -size*0.15, size*0.08, size*0.3);
      fill(90);
      rect(-size*0.2, -size*0.2, size*0.4, size*0.1, 5);
      rect(size*0.5, -size*0.18, size*0.3, size*0.36, 1);
      fill(120);
      quad(size*0.8, -size*0.18, size*0.8, size*0.18, size*0.9, size*0.23, size*0.9, -size*0.23);
      fill(145);
      rect(size*0.9, -size*0.23, size*0.1, size*0.46);
      if (powerupDuration[2] <= 0) fill(playerColor);
      else fill(255, 140, 0);
      if (ammo > 0 && canShoot == true) triangle(size, size*0.18, size, -size*0.18, size*1.2, 0);
      
      popMatrix();
    }
  }
}


// -----------------------------------------

class Shotgun extends Gun {
  
  
  Shotgun(PVector pos) {
    super(pos);
    
    shootTime = 50;
    shootTimer = shootTime;
    damage = 15;
    speed = 25;
    offset = -6;
    capacity = 6;
    ammo = capacity;
    shellSize = 15;
    size = p.size;
  }
  
  void move() {
    
    if (!mobile)
      dir = new PVector(mouseX - p.pos.x, mouseY - p.pos.y);
    else if (closestEnemy != null)
      dir = new PVector(closestEnemy.pos.x = p.pos.x, closestEnemy.pos.y - p.pos.y);
    dir.normalize();
    
    if (carrying == true) {
      
      if (keyPressed && key == 'e' && canShoot == true && ammo > 0 && reloading == false) {
        bullets.add(new Bullet(new PVector(dir.x*speed + p.vel.x, dir.y*speed + p.vel.y), new PVector(p.pos.x + dir.x*10, p.pos.y + dir.y*30), 5, dir, "player", damage));
        bullets.add(new Bullet(new PVector(dir.x*speed + p.vel.x, dir.y*speed + p.vel.y), new PVector(p.pos.x + dir.x*5, p.pos.y + dir.y*10), 5, dir, "player", damage));
        explosions.add(new Explosion(new PVector(p.pos.x + dir.x*20, p.pos.y + dir.y*20), shellSize, color(28, 212, 196)));
        ammo --;
        canShoot = false;
        
        p.vel.add(new PVector(dir.x*-2, dir.y*-2));
      }
      
      if (keyPressed && key == 'w' && reloading == false) {
        reloading = true;
        reloadTimer = 80 - ammo/capacity*80;
      }
      
      if (reloading == true) {
        reloadTimer -= gameSpeed;
        
        if (reloadTimer < 0) {
          reloadTimer = 80;
          ammo = capacity;
          reloading = false;
        }
      }
      
      if (canShoot == false) {
        shootTimer -= gameSpeed;
        if (shootTimer < 0) {
          canShoot = true;
          shootTimer = shootTime;
        }
      }
      
    } else {
      
      if (dist(pos.x, pos.y, p.pos.x, p.pos.y) < 40)
        if (keyPressed && keyCode == SHIFT) {
          weapons.remove(carried);
          carrying = true;
          carried = this;
        }
    }
  }
  
  void display() {
    
    super.display();
    
    if (carrying == true) {
      pushMatrix();
      translate(p.pos.x, p.pos.y);
      if (dir.x >= 0) rotate(atan(dir.y/dir.x));
      else rotate(atan(dir.y/dir.x) + PI);
    
      noStroke();
      fill(140);
      rect(-size*0.3, -size*0.15, size*1.4, size*0.14, 5);
      rect(-size*0.3, size*0.15, size*1.4, -size*0.14, 5);
      fill(102, 60, 0);
      rect(-size*0.5, -size*0.16, size*0.6, size*0.32, 5);
      fill(160);
      ellipse(-size*0.3, 0, size*0.1, size*0.1);
      rect(0, -size*0.05, size*0.3, size*0.1, 5);
      
      popMatrix();
    }
  }
}


// -----------------------------------------


class Sniper extends Gun {
  
  Sniper(PVector pos) {
    super(pos);
    
    damage = 60;
    speed = 50;
    shootTime = 50;
    shootTimer = shootTime;
    offset = -10;
    capacity = 2;
    ammo = capacity;
    size = p.size*0.7;
    shellSize = 15;
  }
  
  void display() {
    
    super.display();
    
    if (carrying == true) {
      pushMatrix();
      translate(p.pos.x, p.pos.y);
      if (dir.x >= 0) rotate(atan(dir.y/dir.x));
      else rotate(atan(dir.y/dir.x) + PI);
    
      noStroke();
      fill(102, 60, 0);
      rect(0, 0, size, size*0.5, 10);
      fill(180);
      rect(size, size*0.175, size*1.3, size*0.15);
      fill(210);
      triangle(size*1.3, size*0.1, size*0.8, size*0.25, size*1.3, size*0.4);
      fill(160);
      rect(size*0.5, size*0.15, size*0.6, size*0.2);
      rect(size*1.3, size*0.1, size*0.2, size*0.3);
      popMatrix();
    }
  }
}




// -----------------------------------------


class Stick extends Gun {
  
  //is knife thrown
  boolean thrown;
    //direction knife is thrown
  PVector direction;
    //where knife is thrown from
  PVector returnPoint;
    //is knife coming back
  boolean returning = false;
    //how fast is knife
  float speed;
    //how long before knife runs out of energy
  float dropTimer;
  
  Stick(PVector pos) {
    super(pos);
    
    thrown = false;
    offset = -6;
    speed = 10;
    dropTimer = 0;
    damage = 34;
    size = p.size*0.7;
  }
  
  void move() {
    
    if (!mobile)
      dir = new PVector(mouseX - p.pos.x, mouseY - p.pos.y);
    else if (closestEnemy != null)
      dir = new PVector(closestEnemy.pos.x = p.pos.x, closestEnemy.pos.y - p.pos.y);
    dir.normalize();
    
    if (powerupDuration[2] > 0) speed = 25;
    else speed = 10;
    
    if (carrying == true) {
      
      if (keyPressed && key == 'e' && thrown == false) {
        thrown = true;
        pos = new PVector(p.pos.x, p.pos.y);
        pos.add(dir);
        direction = new PVector(dir.x, dir.y);
        groundAnimation = 0;
        returnPoint = new PVector(p.pos.x, p.pos.y);
        returning = false;
        dropTimer = 0;
      }
      
    } else {
      
      if (p.pos.x > pos.x - 30 && p.pos.x < pos.x + 30 && p.pos.y < pos.y + 30 && p.pos.y > pos.y - 30)
        if (carried.carrying == true) weapons.remove(carried);
          carrying = true;
        carried = this;
      
    }
    
    if (thrown == true) {
      
      /*
      dropTimer ++;
      
      if (dropTimer > 150) {
        dropTimer = 0;
        thrown = false;
        carrying = false;
      }
      
      */
      
        if (sqrt(sq(pos.x - returnPoint.x) + sq(pos.y - returnPoint.y)) > 400) returning = true;
        
        if (returning == false) pos.add(direction.normalize().mult(speed*gameSpeed));
        else {
          pos.add(new PVector(p.pos.x - pos.x, p.pos.y - pos.y).normalize().mult(speed));
        }
        
        for (Enemy e : enemies) {
          if (dist(e.pos.x, e.pos.y, pos.x, pos.y) < size + e.size/2 + 5) {
            explosions.add(new Explosion(pos, 20, color(255)));
            
            e.health -= damage;
            returning = true;
          }
        }
      
      if (pos.x > width - p.size/2 || pos.x < p.size/2 || pos.y > height - p.size/2 || pos.y < p.size/2)
        returning = true;
        
      if (dist(p.pos.x, p.pos.y, pos.x, pos.y) < 15 && returning == true) thrown = false;
      }
  }

  void display() {
  
    super.display();
  
    pushMatrix();
      
    if (thrown == true) {
        
      translate(pos.x, pos.y);
        
      groundAnimation += 0.4*(gameSpeed/2 + 0.5);
      if (dir.x >= 0) rotate(atan(direction.y/direction.x) + groundAnimation);
      else rotate(atan(direction.y/direction.x) + PI + groundAnimation);
        
    } else {
        
      translate(p.pos.x + dir.x * p.size/2, p.pos.y + dir.y * p.size/2);
      if (dir.x >= 0) rotate(atan(dir.y/dir.x));
      else rotate(atan(dir.y/dir.x) + PI);
        
    }
      
    noStroke();
    if (powerupDuration[2] > 0) fill(255, 140, 0);
    else fill(0, 120, 32);
    beginShape();
      vertex(size*0.4, size*0.2);
      vertex(size*0.55, size*0.35);
      vertex(size*0.7, size*0.3);
      vertex(size*0.6, size*0.21);
    endShape();
    fill(120, 76, 0);
    beginShape();
      vertex(-size*0.4, 0);
      vertex(size*0.1, size*0.3);
      vertex(size*0.7, size*0.15);
      vertex(size*0.75, size*0.08);
      vertex(size*0.19, size*0.18);
    endShape();
    fill(94, 58, 0);
    beginShape();
      vertex(-size*0.5, -size*0.05);
      vertex(-size*0.6, size*0.17);
      vertex(-size*0.2, size*0.3);
      vertex(size*0.8, -size*0.2);
      vertex(size*0.7, -size*0.3);
      vertex(0, 0);
    endShape();
    popMatrix();
    
  }
}



// -----------------------------------------






boolean music = false;
boolean mobile = false;

//used for slowing animation
float gameSpeed = 1;

//type of weapon player is holding
//0 = pistol, 1 = knife, 2 = sniper, 3 = shotgun, 4 = machineGun, 5 = rocketLauncher, 6 = stick
int using = 0;

//variable statistics
float bulletDamage = 0;
//amount bonus for some powerups
int[] amount;


  //determines size of background squares
float squareSize = 80;
  //title screen fades out
int titleFade;

color playerColor;
color enemyColor;

boolean startScreen, endScreen, pause, shopScreen;
    //shop menus
  boolean upgradeScreen, skinScreen, powerupScreen;
    //upgrade menu
  int upgradeScreenMenu = 0;
    //which guns are purchased
  boolean[] purchasedWeapons;
    //powerup levels:
      //0 = coin magnet
      //1 = infinite ammo
      //2 = mega coin
      //3 = regen
      //4 = sheild
  int[] powerups = new int[5];

  //start position of player
PVector startPosition;
  //player
Player p;

  //enemies
ArrayList<Enemy> enemies;
  //aiming on mobile
Enemy closestEnemy;
  //amount of time before enemy spawns
int spawnInterval = 25;
  //game time % when bosses spawn
int bossRound = 400;
  //is the boss alive
boolean bossAlive;

  //particle trail behind player
ArrayList<Particle> contrail;

  //any explosion made on screen
ArrayList<Explosion> explosions;

  //determines how fast weapons despawn
float lifespanIncrement = 0.03;
  //powerups
ArrayList<Powerup> boosts;
    //boost duration for type 1, 2, 5 (coin magnet, infinite ammo, sheild)
  int[] powerupDuration;
    //determines which powerups are active
  int[] active;
  //all weapon types
ArrayList<Gun> weapons;
  //bullets fired from player and enemies
ArrayList<Bullet> bullets;
  //gun which player is holding
Gun carried;
  //coins
ArrayList<Coin> coins;
  //amount of coins player has collected this round
int collectedCoins, finalCollectedCoins;
  //total number of coins player has
int totalCoins;

  //player score, highest score, bonus points, amount score has to be divided by
float score, scoreFrac;
int highScore, bonus;
  //bonus indicators arraylist
ArrayList<Bonus> bonuses;

  //x of function for spawning enemies
int round = 1;
  //number of games played
int gameNum = 0;
  //tutorial screen is out
boolean minimize = false;
  //sliding tutorial screen animation
int slide = 0;

boolean canSpawn = true;
boolean coinSpawn = false;

void setup() {
  
      //igonore amount[0]
  amount = new int[6];
  
  purchasedWeapons = new boolean[7];

  highScore = 0;
  totalCoins = 0;
  
  for (int i = 2; i < 2 + powerups.length; i++) {
    powerups[i-2] = 0;
  }
  
  for (int i = 2 + powerups.length; i < 2 + powerups.length + amount.length; i++) {
    amount[i - 2 - powerups.length] = 0;
  }
  
  for (int i = 2 + powerups.length + amount.length; i < 2 + powerups.length + amount.length + purchasedWeapons.length; i++) {
    purchasedWeapons[i - (2 + powerups.length + amount.length)] = true;
  }
  
  using = 0;
  
  playerColor = color(28, 212, 196);
  enemyColor = color(168, 72, 50);
  
  startScreen = true;
  endScreen = false;
  upgradeScreen = true;
  titleFade = 40;
  
    //determines size of background squares
  for (float i = 0; i < 30; i+=0.5) {
  if (width/(squareSize + i) - floor(width/(squareSize + i)) > 0.9)
    if (height/(squareSize + i) - floor(height/(squareSize + i)) > 0.9) {
      squareSize = squareSize + i;
      i = 30;
    }
}
  
  startPosition = new PVector(width/2, height/2);
  p = new Player(startPosition);
  
  enemies = new ArrayList<Enemy>();
  
  contrail = new ArrayList<Particle>();
  
  explosions = new ArrayList<Explosion>();
  
  boosts = new ArrayList<Powerup>();
    powerupDuration = new int[6];
    active = new int[5];
  weapons = new ArrayList<Gun>();
  bullets = new ArrayList<Bullet>();
  coins = new ArrayList<Coin>();
  
  bonuses = new ArrayList<Bonus>();
  
  scoreFrac = 40;
 
  //size (1500, 900, P2D);
  size(500, 500);
  
}

void keyPressed() {
  p.keyPressed();
}

  //finds pvector farther than 300 pixels from player
PVector spawnPos() {
  PVector spawnPosition = new PVector(random(50, width-50), random(50, height-50));
  
  for (int i = 0; i < 10; i++) {
    if (dist(spawnPosition.x, spawnPosition.y, p.pos.x, p.pos.y) < 500)
      spawnPosition = new PVector(random(50, width-50), random(50, height-50));
    else return spawnPosition;
  }
  
  return spawnPosition;
}

void mouseClicked() {
  
    //shop
  if (shopScreen == true) {
    
      //skins
    if (skinScreen == true) {
      if (dist(mouseX, mouseY, width - 100, height/2) < 40) {skinScreen = false; upgradeScreen = true; }
    }
    
    //upgrades
    if (upgradeScreen == true) {
      if (dist(mouseX, mouseY, width - 100, height/2) < 40) {upgradeScreen = false; powerupScreen = true; }
      if (dist(mouseX, mouseY, 100, height/2) < 40) {upgradeScreen = false; skinScreen = true; }
      
      if (dist(mouseX, mouseY, width/2 - 400, height/2) < 30 && upgradeScreenMenu > 0) { upgradeScreenMenu --; }
      if (dist(mouseX, mouseY, width/2 + 400, height/2) < 30 && upgradeScreenMenu < 6) { upgradeScreenMenu ++; }
      
      if (mouseX > width/2 - 350 && mouseX < width/2 + 350 && mouseY > height/2 + 200 && mouseY < height/2 + 400) {
        if (purchasedWeapons[upgradeScreenMenu] == false) { 
          
          if (upgradeScreenMenu < 5) {
            
            if (totalCoins >= (int)sq(upgradeScreenMenu)*500) {
              
              purchasedWeapons[upgradeScreenMenu] = true;
              totalCoins -= (int)sq(upgradeScreenMenu)*500;
            }
            
          } else if (upgradeScreenMenu == 5) {
            
            if (highScore > -1 && totalCoins >= 25000) {
              
              purchasedWeapons[5] = true;
              totalCoins -= 25000;
              
            }
          } else if (upgradeScreenMenu == 6) {
            
            if (highScore > -1 && totalCoins >= 50000) {
              
              purchasedWeapons[6] = true;
              totalCoins -= 50000;
              
            }
          }
        }
      }
      
      if (mouseX > 50 && mouseX < 350 && mouseY > height/2 + 150 && mouseY < height/2 + 250 && using != upgradeScreenMenu) {
        using = upgradeScreenMenu;
      }
    }
    
    //powerups
    if (powerupScreen == true) {
      if (dist(mouseX, mouseY, width - 100, height/2) < 40) {shopScreen = false; startScreen = true; }
      if (dist(mouseX, mouseY, 100, height/2) < 40) {powerupScreen = false; upgradeScreen = true; }
    }
  }
  
   //start screen
  if (startScreen == true) {
      //play
    if (mouseX > width/2 - 150 && mouseX < width/2 + 150 && mouseY > height/2 - 60 && mouseY < height/2 + 60) {
      newGame();
    }
      
      //shop
    if (dist(mouseX, mouseY, 100, height/2) < 40) {
      startScreen = false;
      shopScreen = true;
      skinScreen = false;
      upgradeScreen = false;  
      powerupScreen = true;
    }
  }
  
  //pause game
  if (mouseX > 25 && mouseX < 83 && mouseY > 15 && mouseY < 80 && startScreen == false && endScreen == false) {
    pause = true;
  }
    
  if (pause == true) {
      //resume
    if (mouseX > 380 && mouseX < width-380 && mouseY > 200 && mouseY < height/2) {
      pause = false;
      titleFade = 20;
    }
      //menu
    if (mouseX > 380 && mouseX < width-380 && mouseY > height/2 && mouseY < height-200) {
      pause = false;
      startScreen = true;
      titleFade = 20;
    }
  }
    //end screen
  if (endScreen == true) {
      //play again
    if (mouseX > 420 && mouseX < width - 420 && mouseY > height/3*2 - 110 && mouseY < height/3*2 + 10 && titleFade > 140) {
      newGame();
    }
    
      //back to start screen
    if (mouseX > 420 && mouseX < width - 420 && mouseY > height/3*2 - 30 && mouseY < height/3*2 + 150 && titleFade >= 150) {
        startScreen = true;
        endScreen = false;
    }
  }
}

  //spawns powerups
void spawnPowerup(PVector pos) {
  
  float i = random(0, 2);
  
  if (i > 1) boosts.add(new Powerup(pos, floor((i-1)*5) + 1));
}

  //responsable for spawning  enemies, bosses, general game progression
void spawnEnemy() {
  
  if (pause == false) score += gameSpeed;
  
    //stage 1
    
  if (floor(score/scoreFrac) % bossRound == bossRound-2) canSpawn = true;
  
  if (floor(score/scoreFrac) % bossRound != bossRound-1) {
    
    if (floor(score/scoreFrac) % spawnInterval == 1 && canSpawn == true && bossAlive == false) {
        canSpawn = false;
        for (int i = 0; i <= floor(score/scoreFrac); i += 150) {
          enemies.add(new Enemy(spawnPos(), 50 - round/2, 10 + round, 100 + 4*round, 1, 0.08));
          spawnInterval = 25 + (i/150)*5;
        }
        round ++;
      } else if (floor(score/scoreFrac) % spawnInterval == 3) canSpawn = true;
  } else if (canSpawn == true) {
    enemies.add(new Boss1(spawnPos(), 150, 100, 2000, 14, 0.04));
    canSpawn = false;
    bossAlive = true;
  }
}

  //show weapon in menu screen
void displayWeapon (PVector pos, int index, int size) {
  
  pushMatrix();
  translate(pos.x, pos.y);
  
  if (index == 0) {
    
    fill(120);
    textSize(50);
    if (upgradeScreenMenu == index) text("pistol", 0, -size*1.2);
    
    translate(-size*0.4, 0);
      
    rotate(-PI/5);
    noStroke();
    fill(140, 140, 140, 250);
    rect(size*0.1 - 6, - 6, size*0.3, size, 10);
    fill(180, 180, 180, 250);
    rect(- 6, - 6, size*1.2, size*0.4);
    rect(- 6, size*0.4 + - 6, size*0.5, size*0.2);
    rect(- 6, size*0.5 + - 6, size*0.8, size*0.05);
    fill(110);
    rect(size*0.1 + - 6, size*0.1 + - 6, size*0.7, size*0.2, 10);

  }
  
  if (index == 1) {
    
    fill(120);
    textSize(50);
    if (upgradeScreenMenu == index) text("knife", 0, -size*1.2);
    
    rotate(PI*6/5);
    noStroke();
    fill(102, 60, 0);
    rect(-size*0.15, -size*0.7, size*0.3, size*0.6);
    fill(100);
    ellipse(0, -size*0.7, size*0.5, size*0.5);
    fill(28, 212, 196);
    ellipse(0, -size*0.7, size*0.2, size*0.2);
    fill(150);
    quad(0, -size*0.1, -size*0.2, -size*0.1, -size*0.13, size*0.5, 0, size*0.7);
    fill(110);
    quad(0, -size*0.1, size*0.2, -size*0.1, size*0.13, size*0.5, 0, size*0.7);
    fill(130);
    triangle(0, -size*0.3, -size*0.4, -size*0.1, size*0.4, -size*0.1);
    
  }
  
  if (index == 2) {
    
    fill(120);
    textSize(50);
    if (upgradeScreenMenu == index) text("sniper", 0, -size*1.2);
    
    translate(-size/2 - 10, -10);
      
    noFill();
    stroke(130);
    strokeWeight(3);
    ellipse(13, 4 + size*0.5, size*0.4, size*0.3);
    noStroke();
    fill(48, 29, 0);
    rect(1, 0, size*0.4, size, 15);
    fill(102, 60, 0);
    rect(0, 5, size, size*0.5, 10);
    fill(180);
    rect(size, size*0.175 + 5, size*1.3, size*0.15);
    fill(210);
    triangle(size*1.3, size*0.1, size*0.8, size*0.25, size*1.3, size*0.4);
    fill(160);
    rect(size*0.5, size*0.15, size*0.6, size*0.2);
    rect(size*1.3, size*0.1, size*0.2, size*0.3);
    
  }
  
  if (index == 3) {
    
    fill(120);
    textSize(50);
    if (upgradeScreenMenu == index) text("shotgun", 0, -size*1.2);
    
    translate(-size/3, 0);
      
    noFill();
    stroke(80);
    strokeWeight(2);
    ellipse(-size*0.05, size*0.17, 4, 4);
    noStroke();
    fill(80);
    rect(-size*0.4, 0, size*0.3, size*0.35, 2);
    fill(90);
    rect(-size*0.3, -size*0.05, size*1.4, size*0.14, 5);
    fill(140);
    rect(-size*0.3, size*0.15, size*1.4, -size*0.14, 5);
    fill(102, 60, 0);
    rect(-size*0.5, -size*0.06, size*0.6, size*0.22, 5);
    fill(160);
    ellipse(-size*0.3, 0, size*0.1, size*0.05);
    rect(0, -size*0.05, size*0.3, size*0.08, 5);
    
  }
  
  if (index == 4) {
    
    fill(120);
    textSize(50);
    if (upgradeScreenMenu == index) text("machine gun", 0, -size*1.2);
    
    translate(-size/2, 0);
    
    pushMatrix();
    stroke(60);
    rotate(PI/6);
    rect(-size*0.15, 0, size*0.3, size*0.6, 3);
    popMatrix();
  
    stroke(60);
    strokeWeight(1 * size/35);
      line(0, -8.75 * size/35, size*1.34, -8.75 * size/35);
      line(0, 8.75 * size/35, size*1.34, 8.75 * size/35);
    stroke(90);
    strokeWeight(2 * size/35);
    line(size*0.8, 0, size*1.05, size*0.8);
    line(size*0.8, 0, size*1.2, size*0.45);
      noStroke();
    fill(50);
      rect(size*0.7, -size*0.3, size*0.1, size*0.6, 5);
    stroke(150);
    strokeWeight(4 * size/35);
      line(0, 0, size*1.399, 0);
    stroke(120);
    strokeWeight(3.5 * size/35);
      line(0, -3.5 * size/35, size*1.39, -3.5 * size/35);
      line(0, 3.5 * size/35, size*1.39, 3.5 * size/35);
    stroke(90);
    strokeWeight(2.5 * size/35);
      line(0, -6.5 * size/35, size*1.37, -6.5 * size/35);
      line(0, 6.5 * size/35, size*1.37, 6.5 * size/35);
    stroke(30);
    fill(0);
      noStroke();
    fill(163);
      rect(-size/3, -size/3, size/3*2, size/3*2, 5);
    fill(100);
      rect(-size/4, -size/4, size, size/2, 5);
  }
  
  if (index == 5) {
    
    if (highScore > -1) {
      
      fill(120);
      textSize(50);
      if (upgradeScreenMenu == index) text("rocket launcher", 0, -size*1.2);
      
      noStroke();
      fill(75);
      rect(-size*0.2, 0, size*0.2, size*0.5, 3);
      rect(size*0.2, 0, size*0.15, size*0.4, 3);
      fill(165);
      triangle(-size*0.8, -size*0.25, -size*0.77, size*0.25, -size*0.4, 0);
      fill(145);
      rect(-size*0.6, -size*0.15, size*1.4, size*0.3);
      fill(100);
      rect(-size*0.1, -size*0.15, size*0.08, size*0.3);
      fill(90);
      rect(-size*0.2, -size*0.05, size*0.4, size*0.1, 5);
      stroke(playerColor);
      strokeWeight(2);
      line(-size*0.15, 0.01, size*0.15, 0.01);
      noStroke();
      rect(size*0.5, -size*0.18, size*0.3, size*0.36, 1);
      fill(120);
      quad(size*0.8, -size*0.18, size*0.8, size*0.18, size*0.9, size*0.23, size*0.9, -size*0.23);
      fill(145);
      rect(size*0.9, -size*0.23, size*0.1, size*0.46);
      
    } else {
      
      fill(60);
      textSize(50);
      if (upgradeScreenMenu == index) text("???", 0, -size*1.2);
      
      noStroke();
      rect(-size*0.2, 0, size*0.2, size*0.5, 3);
      rect(size*0.2, 0, size*0.15, size*0.4, 3);
      triangle(-size*0.8, -size*0.25, -size*0.77, size*0.25, -size*0.4, 0);
      rect(-size*0.6, -size*0.15, size*1.4, size*0.3);
      rect(-size*0.1, -size*0.15, size*0.08, size*0.3);
      rect(-size*0.2, -size*0.05, size*0.4, size*0.1, 5);
      stroke(30);
      strokeWeight(0.5);
      line(-size*0.15, 0.01, size*0.15, 0.01);
      noStroke();
      rect(size*0.5, -size*0.18, size*0.3, size*0.36, 1);
      quad(size*0.8, -size*0.18, size*0.8, size*0.18, size*0.9, size*0.23, size*0.9, -size*0.23);
      rect(size*0.9, -size*0.23, size*0.1, size*0.46);
      
    }
    
  }
  
  if (index == 6) {
    
    if (highScore > -1) {
      
      fill(120);
      textSize(50);
      if (upgradeScreenMenu == index) text("stick", 0, -size*1.2);
      
      noStroke();
      fill(0, 120, 32);
      beginShape();
        vertex(size*0.4, size*0.2);
        vertex(size*0.55, size*0.35);
        vertex(size*0.7, size*0.3);
        vertex(size*0.6, size*0.21);
      endShape();
      fill(120, 76, 0);
      beginShape();
        vertex(-size*0.4, 0);
        vertex(size*0.1, size*0.3);
        vertex(size*0.7, size*0.15);
        vertex(size*0.75, size*0.08);
        vertex(size*0.19, size*0.18);
      endShape();
      fill(94, 58, 0);
      beginShape();
        vertex(-size*0.5, -size*0.05);
        vertex(-size*0.6, size*0.17);
        vertex(-size*0.2, size*0.3);
        vertex(size*0.8, -size*0.2);
        vertex(size*0.7, -size*0.3);
        vertex(0, 0);
      endShape();
      
    } else if (highScore > -1) {
      
      fill(60);
      textSize(50);
      if (upgradeScreenMenu == index) text("???", 0, -size*1.2);
      
      noStroke();
      beginShape();
        vertex(size*0.4, size*0.2);
        vertex(size*0.55, size*0.35);
        vertex(size*0.7, size*0.3);
        vertex(size*0.6, size*0.21);
      endShape();
      beginShape();
        vertex(-size*0.4, 0);
        vertex(size*0.1, size*0.3);
        vertex(size*0.7, size*0.15);
        vertex(size*0.75, size*0.08);
        vertex(size*0.19, size*0.18);
      endShape();
      beginShape();
        vertex(-size*0.5, -size*0.05);
        vertex(-size*0.6, size*0.17);
        vertex(-size*0.2, size*0.3);
        vertex(size*0.8, -size*0.2);
        vertex(size*0.7, -size*0.3);
        vertex(0, 0);
      endShape();
      
    } else {
      
      fill(60);
      textSize(50);
      if (upgradeScreenMenu == index) text("???", 0, -size*1.2);
      
      fill(50);
      noStroke();
      ellipse(0, 0, size*0.8, size*0.8);
    }
    
  }
  
  popMatrix();
  
}

  //resets conditions for game
void newGame() {
  p.charge = 0;
  score = 0;
  bonus = 0;
  startScreen = false;
  endScreen = false;
  p.pos = new PVector(width/2, height/2 + 10);
  p.health = 200;
  p.vel = new PVector(0, 0);
  bonuses.clear();
  bullets.clear();
  coins.clear();
  enemies.clear();
  explosions.clear();
  weapons.clear();
  bonuses.clear();
  collectedCoins = 0;
  round = 1;
  gameNum ++;
  titleFade = 40;
  canSpawn = true;
  bossAlive = false;
  boosts.clear();
  
  for (int i = 0; i < powerupDuration.length; i++)
    powerupDuration[i] = 0;
  
  if (using == 0) weapons.add(new Pistol(p.pos));
  else if (using == 1) weapons.add(new Knife(p.pos));
  else if (using == 2) weapons.add(new Sniper(p.pos));
  else if (using == 3) weapons.add(new Shotgun(p.pos));
  else if (using == 4) weapons.add(new MachineGun(p.pos));
  else if (using == 5) weapons.add(new RocketLauncher(p.pos));
  else if (using == 6) weapons.add(new Stick(p.pos));
}

  //for creating buttons
void button(float x, float y, float sizeX, float sizeY, String text) {
  noFill();
  if (mouseX > x - sizeX/2 && mouseX < x + sizeX/2 && mouseY > y - sizeY/2 && mouseY < y + sizeY/2) stroke(150);
  else stroke(120);
  strokeWeight(4);
  rect(x-sizeX/2, y - sizeY/2, sizeX, sizeY);
  if (mouseX > x - sizeX/2 && mouseX < x + sizeX/2 && mouseY > y - sizeY/2 && mouseY < y + sizeY/2) fill(150);
  else fill(120);
  textAlign(CENTER, CENTER);
  if (sizeY < sizeX*3) textSize(sizeY/3);
  else textSize(sizeX/9);
  text(text, x, y);
}

void mouse() {
  
  if (powerupDuration[2] <= 0) { stroke(255); fill(255); }
  else { stroke(255, 140, 0); fill(255, 140, 0); }
  strokeWeight(1.5);
  line(mouseX - 12, mouseY, mouseX - 6, mouseY);
  line(mouseX + 6, mouseY, mouseX + 12, mouseY);
  line(mouseX, mouseY - 12, mouseX, mouseY - 6);
  line(mouseX, mouseY + 6, mouseX, mouseY + 12);
  
  noStroke();
  ellipse(mouseX, mouseY, 1.5, 1.5);
}

void draw () {
  
  for (Explosion e : explosions) e.quake();
  
  p.slowMo();
  
  translate(-p.pos.x/(10*(gameSpeed/2+0.5)) + width/(20*(gameSpeed/2+0.5)), -p.pos.y/(10*(gameSpeed/2+0.5)) + height/(20*(gameSpeed/2+0.5)));
  
  if (startScreen == true) {
    
    titleFade = 40;
    background(titleFade);
    
    stroke(55);
    strokeWeight(0.5);
    for (int x = 1; x < width/squareSize; x ++)
      line (x*squareSize, 0, x*squareSize, height);
    for (int y = 1; y < height/squareSize + 1; y++)
      line (0, y*squareSize, width, y*squareSize);

    textSize(40);
    if(highScore != 0) text("high score: " + highScore, width/2, height/6 + 260);
    fill(50);
    rect(width/7*2, height/12, width/7*3, 80);
    fill(120);
    textSize(50);
    text(totalCoins, width/2, height/12 + 33);
    stroke(156, 96, 0, 230);
    strokeWeight(5);
    fill(255, 195, 15, 230);
    ellipse(width/7*5 - 40, height/12 + 40, 40, 40);
    fill(120);
    
    button(width/2, height/2, 300, 120, "play");
    
      //shop
    pushMatrix();
    translate(100, height/2);
    noStroke();
    if (dist(mouseX, mouseY, 100, height/2) < 40) fill(150);
    else fill(120);
    rotate(-PI/4);
    rect(-25, -25, 50, 10, 5);
    rotate(-PI/2);
    rect(-25, -25, 50, 10, 5);
    popMatrix();
   
    p.pos = new PVector(width/2, height/2);
    p.vel = new PVector(0, 0);
    
    
  } else if (endScreen == false && shopScreen == false) {
    
    background(titleFade);
    
    if (titleFade > 21 && pause == false) titleFade -= sq(21 - titleFade)/100;
    if (pause == true) background(20);
    
    stroke(35);
    strokeWeight(0.5);
    for (int i = 1; i < height/squareSize; i ++)
      line(0, i*squareSize, width, i*squareSize);
    for (int i = 1; i < width/squareSize; i++)
      line(i*squareSize, 0, i*squareSize, height);

    textAlign(LEFT, DOWN);
    textSize(60);
    fill(90);
    //text("health", 20, height-50);
    
    if (p.health > 0) {
      fill(0, 100, 0);
      noStroke();
      rect(width/2 - 500, 50, p.health*5, 8);
      fill(100, 0, 0);
      rect(width/2 + 500, 50, -(200 - p.health) * 5, 8);
    } else {
      fill(100, 0, 0);
      rect(width/2 - 500, 50, 1000, 8);
    }
    
    textAlign(RIGHT, DOWN);
    fill(90);
    text((floor(score/scoreFrac) + bonus), width-20, height-30);
    
    fill(10, 200);
    if (collectedCoins < 10) quad(width-100, height-155, width-120, height-100, width + 110, height-100, width + 110, height-155);
    else if (collectedCoins < 100) quad(width-125, height-155, width-145, height-100, width + 110, height-100, width + 110, height-155); 
    else if (collectedCoins < 1000) quad(width-150, height-155, width-170, height-100, width + 110, height-100, width + 110, height-155);
    else quad(width-175, height-155, width-195, height-100, width + 110, height-100, width + 110, height-155);
    fill(90);
    textSize(45);
    text(collectedCoins, width-60, height-110);
    stroke(156, 96, 0);
    strokeWeight(4);
    fill(255, 195, 15);
    ellipse(width-35, height-127.5, 25, 25);
    
    for (int i = 0; i < active.length; i++) {
      
      if (active[i] != 0 && powerupDuration[active[i]] <= 0) active[i] = 0;
      
      if (active[i] == 1) fill(186, 55, 7);
      if (active[i] == 2) fill(255, 140, 0);
      if (active[i] == 5) fill(20, 147, 201);
      
      noStroke();
      if (active[i] > 0) rect(width/2 - powerupDuration[active[i]]/4, 68 + i*18, powerupDuration[active[i]]/2, 8);
    }
    
    spawnEnemy();
    
    //if (floor(score/scoreFrac) % 5 == 0 && coinSpawn == true) { coins.add (new Coin(new PVector(random(10, width-10), random(10, height-10)), false)); coinSpawn = false; }
    //if (floor(score/scoreFrac) % 5 == 2) coinSpawn = true;
    
    for (int i = 0; i < coins.size(); i++) {
      Coin c = coins.get(i);
      if (pause == false) c.move();
      c.display();
      
      if (c.collected() == true) {
        coins.remove(i);
        collectedCoins++;
      }
    }
    
      //draws bullets, remove bullets if they hit the edge or hit a player
    for (int i = 0; i < bullets.size(); i++) {
      Bullet b = bullets.get(i);
      if (pause == false) b.move();
      b.display();
      b.hit();
      
      if (b.hit() == true)
        bullets.remove(b);
    }
    
    for (int i = 0; i < weapons.size(); i++) {
      Gun g = weapons.get(i);
      if (pause == false) g.move();
      g.display();
    }
    
    for (int i = 0; i < boosts.size(); i++) {
      Powerup r = boosts.get(i);
      r.display();
      
      if (r.used()) boosts.remove(r);
    }
    
    for (int i = 0; i < powerupDuration.length; i++) {
      if (powerupDuration[i] > 0 && i != 5) powerupDuration[i] --;
    }
    
      //checks if enemies merge or if enemy is dead
    for (int i = 0; i < enemies.size(); i++) {
      Enemy e = enemies.get(i);
      if (pause == false) e.move();
      e.display();
      e.checkCollision(p);
      
      if (mobile == true) {
        if (closestEnemy == null)
          closestEnemy = e;
        
        if (dist(closestEnemy.pos.x, closestEnemy.pos.y, p.pos.x, p.pos.y) > dist(e.pos.x, e.pos.y, p.pos.x, p.pos.y))
          closestEnemy = e;
      }
      
      for (int j = 0; j < enemies.size(); j++) {
        Enemy f = enemies.get(j);
        if (dist(e.pos.x, e.pos.y, f.pos.x, f.pos.y) < 4 && e != f && e.canCombine && f.canCombine) {
          explosions.add(new Explosion(e.pos, e.size, color(255)));
          enemies.add(new Enemy(e.pos, (e.rate+f.rate)/4.5, e.damage*0.8 + f.damage*0.8, e.health+f.health, f.value + e.value, e.speed*0.6 + f.speed*0.6));
          enemies.remove(e);
          enemies.remove(f);
        }
      }
        
      if (e.isDead() == true && pause == false) {
          //probability a new weapon is dropped
        for (int j = 0; j < e.value; j++) {
          float probability = random(0, 1);
        
          spawnPowerup(e.pos);
          
          for (float k = 0.1; k < 1; k += 0.2)
          if (probability > j) coins.add(new Coin(new PVector(e.pos.x, e.pos.y), true));
        }
        
        if (i <= round/2) {
          bonuses.add(new Bonus(new PVector(e.pos.x, e.pos.y), spawnInterval - floor(score/scoreFrac)%spawnInterval, color(255)));
          bonus += spawnInterval - floor(score/scoreFrac)%spawnInterval;
        }
        
        explosions.add(new Explosion(new PVector(e.pos.x, e.pos.y), e.size/2, color(168, 72, 50)));
        enemies.remove(i);
        
          //checks if enemy is boss
        if (e.canCombine == false) {
          for (Enemy g : enemies)
            g.health = 0;
          
          bonus += 200;
          bonuses.add(new Bonus(e.pos, 200, color(255)));
          bossAlive = false;
        }
      }
    }
    
    if (p.isDead()) {
      
      explosions.add(new Explosion(new PVector(p.pos.x, p.pos.y), 15, color(28, 212, 196, 70)));
      endScreen = true;
      p.pos = new PVector(width/2, height/2);
      fill(100, 0, 0, 150);
      rect(410, height-20, -400, 4);
      bonuses.clear();
      finalCollectedCoins = collectedCoins;
      if (floor(score/scoreFrac)+bonus > highScore) highScore = floor(score/scoreFrac)+bonus;

      
    } else {
      
      if (pause == false) p.move();
      p.display();
      
        //pause button
      pushMatrix();
        translate(p.pos.x/10 - width/20, p.pos.y/10 - height/20);
        noStroke();
      
        if (pause == true) {
          if (titleFade <= 60) titleFade++;
          if (titleFade > 40) button(width/2, height/2-165, 300, height/2-230, "resume");
          if (titleFade > 60) button(width/2, height/2+165, 300, height/2-230, "menu");
        } else {
          if (mouseX > 25 && mouseX < 83 && mouseY > 15 && mouseY < 80) fill(120, 50);
          else fill(90, 50);
          rect(30, 20, 20, 55, 5);
          rect(58, 20, 20, 55, 5);
        }
      
      popMatrix();
      
    }
    
    //end screen
  } else {
    if (titleFade < 150) titleFade++;
      
    if (titleFade < 90) {
      fill(40, 130);
      rect(-300, -300, width+600, height+600);
    } else background(40);
    
    stroke(55);
    strokeWeight(0.5);
    for (int x = 1; x < width/58; x ++)
      line (x*58, 0, x*58, height);
      
    for (int y = 1; y < height/58 + 1; y++)
      line (0, y*58, width, y*58);
    
    textAlign(CENTER, CENTER);
    textSize(140);
    fill(120);
    if (titleFade > 110) text("you are dead", width/2, height/6+160);
    textSize(40);
    if(titleFade > 120) text("score: " + (floor(score/scoreFrac)+bonus), width/2, height/6 + 260);
    
    fill(50);
    rect(width/7*2, height/6, width/7*3, 80);
    if (collectedCoins == finalCollectedCoins && finalCollectedCoins != 0) 
      bonuses.add(new Bonus(new PVector(width/2, height/6), collectedCoins, color(255))); 
    if (collectedCoins > 0) { collectedCoins --; totalCoins ++; }
    fill(120);
    textSize(50);
    text(totalCoins, width/2, height/6 + 40);
    stroke(156, 96, 0, 230);
    strokeWeight(5);
    fill(255, 195, 15, 230);
    ellipse(width/7*5 - 40, height/6+40, 40, 40);
      
    if (titleFade > 140) button(width/2, height/3*2-50, 300, 120, "play again");
    
    if (titleFade >= 150) button(width/2, height/3*2+90, 300, 120, "menu");
  }
    
  for (Explosion b : explosions)
      b.move();
    
  for (int i = 0; i < explosions.size(); i++) {
    Explosion b = explosions.get(i);
      
      //removes explosion if time has expired
    if (b.isDead() == true)
      explosions.remove(b);
  }
    
  for (int i = 0; i < bonuses.size(); i++) {
    Bonus b = bonuses.get(i);
    b.display();
    if (b.isDead()) bonuses.remove(b);
  }  
    
    //shop
  if (shopScreen == true) {
    
    background(40);
    
    stroke(55);
    strokeWeight(0.5);
    for (int x = 1; x < width/squareSize; x ++)
      line (x*squareSize, 0, x*squareSize, height);
    for (int y = 1; y < height/squareSize + 1; y++)
      line (0, y*squareSize, width, y*squareSize);

    textAlign(CENTER, CENTER);
    textSize(100);
    fill(50);
    rect(width/7*2, height/6, width/7*3, 80);
    fill(120);
    textSize(50);
    text(totalCoins, width/2, height/6 + 40);
    stroke(156, 96, 0, 230);
    strokeWeight(5);
    fill(255, 195, 15, 230);
    ellipse(width/7*5 - 40, height/6+40, 40, 40);
    
    pushMatrix();
    translate(width - 100, height/2);
    noStroke();
    if (dist(mouseX, mouseY, width - 100, height/2) < 40) fill(150);
    else fill(120);
    rotate(PI/4);
    rect(-25, -25, 50, 10, 5);
    rotate(PI/2);
    rect(-25, -25, 50, 10, 5);
    popMatrix();
    
    if (upgradeScreen || powerupScreen) {
      pushMatrix();
      translate(100, height/2);
      noStroke();
      if (dist(mouseX, mouseY, 100, height/2) < 40) fill(150);
      else fill(120);
      rotate(-PI/4);
      rect(-25, -25, 50, 10, 5);
      rotate(-PI/2);
      rect(-25, -25, 50, 10, 5);
      popMatrix();
    }
    
    if (upgradeScreen == true) {
      textSize(80);
      fill(120);
      text("upgrades", width/2, 80);
      
      if (purchasedWeapons[upgradeScreenMenu] == false && upgradeScreenMenu < 5) {
        button(width/2, height/2 + 300, 700, 200, ""+(int)sq(upgradeScreenMenu)*500);
        
        stroke(156, 96, 0);
        strokeWeight(8);
        fill(255, 195, 15);
        ellipse(width/2 + 250, height/2 + 300, 50, 50);
      }
      
      if (purchasedWeapons[upgradeScreenMenu] == false && upgradeScreenMenu == 5) {
        if (highScore < -1) {
          fill(60);
          textSize(50);
          text("???", width/2, height/2 + 300);
          strokeWeight(4);
          noFill();
          stroke(50);
          rect(width/2 - 350, height/2 + 200, 700, 200);
        } else {
          button(width/2, height/2 + 300, 700, 200, "25000");
          
          stroke(156, 96, 0);
          strokeWeight(8);
          fill(255, 195, 15);
          ellipse(width/2 + 250, height/2 + 300, 50, 50);
        }
      }
      
      if (purchasedWeapons[upgradeScreenMenu]) {
        if (using == upgradeScreenMenu) {
          
          fill(80);
          textSize(30);
          text("using", 200, height/2 + 200);
          strokeWeight(4);
          noFill();
          stroke(80);
          rect(50, height/2 + 150, 300, 100);
          
        } else {
          //50 && mouseX < 350 && mouseY > height/2 + 150 && mouseY < height/2 + 250
          button(200, height/2 + 200, 300, 100, "use");
          
        }
      }
      
      if (purchasedWeapons[upgradeScreenMenu] == false && upgradeScreenMenu == 6) {
        if (highScore < -1) {
          fill(60);
          textSize(50);
          text("???", width/2, height/2 + 300);
          strokeWeight(4);
          noFill();
          stroke(50);
          rect(width/2 - 350, height/2 + 200, 700, 200);
        } else {
          button(width/2, height/2 + 300, 700, 200, "50000");
          
          stroke(156, 96, 0);
          strokeWeight(8);
          fill(255, 195, 15);
          ellipse(width/2 + 250, height/2 + 300, 50, 50);
        }
      }
      
      if (upgradeScreenMenu == 0) {
        
        displayWeapon(new PVector(width/2, height/2), upgradeScreenMenu, 100);
        displayWeapon(new PVector(width/2 + 220, height/2), upgradeScreenMenu + 1, 40);
        
        pushMatrix();
        translate(width/2 + 400, height/2);
        noStroke();
        if (dist(mouseX, mouseY, width/2 + 400, height/2) < 30) fill(150);
        else fill(120);
        rotate(PI/4);
        rect(-15, -15, 30, 6, 3);
        rotate(PI/2);
        rect(-15, -15, 30, 6, 3);
        popMatrix();
        
      }
      
      else if (upgradeScreenMenu == 6) {
        
        displayWeapon(new PVector(width/2, height/2), upgradeScreenMenu, 100);
        displayWeapon(new PVector(width/2 - 220, height/2), upgradeScreenMenu - 1, 40);
        
        pushMatrix();
        translate(width/2 - 400, height/2);
        noStroke();
        if (dist(mouseX, mouseY, 100, height/2) < 30) fill(150);
        else fill(120);
        rotate(-PI/4);
        rect(-15, -15, 30, 6, 3);
        rotate(-PI/2);
        rect(-15, -15, 30, 6, 3);
        popMatrix();
        
      } else {
        
        displayWeapon(new PVector(width/2, height/2), upgradeScreenMenu, 100);
        displayWeapon(new PVector(width/2 - 220, height/2), upgradeScreenMenu - 1, 40);
        displayWeapon(new PVector(width/2 + 220, height/2), upgradeScreenMenu + 1, 40);
        
        pushMatrix();
        translate(width/2 + 400, height/2);
        noStroke();
        if (dist(mouseX, mouseY, width/2 + 400, height/2) < 30) fill(150);
        else fill(120);
        rotate(PI/4);
        rect(-15, -15, 30, 6, 3);
        rotate(PI/2);
        rect(-15, -15, 30, 6, 3);
        popMatrix();
        
        pushMatrix();
        translate(width/2 - 400, height/2);
        noStroke();
        if (dist(mouseX, mouseY, 100, height/2) < 30) fill(150);
        else fill(120);
        rotate(-PI/4);
        rect(-15, -15, 30, 6, 3);
        rotate(-PI/2);
        rect(-15, -15, 30, 6, 3);
        popMatrix();
        
      }
    }
    
    if (powerupScreen == true) {
      textSize(80);
      fill(120);
      text("powerups", width/2, 80);
      
    }
    
    if (skinScreen == true) {
      textSize(80);
      fill(120);
      text("skins", width/2, 80);
    }
  }
  
  mouse();
}
