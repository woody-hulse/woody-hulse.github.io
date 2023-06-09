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
